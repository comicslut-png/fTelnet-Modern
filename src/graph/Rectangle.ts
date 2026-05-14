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
 * Axis-aligned rectangle with public `x`, `y`, `width`, `height`
 * fields and derived `left`/`right`/`top`/`bottom` accessors.
 *
 * Partial port of the ActionScript 3 `Rectangle` class — kept for
 * RIPscrip parser compatibility, which models button hit-boxes and
 * other regions with this shape.
 *
 * Setter semantics: assigning to a derived accessor (e.g. `left = 5`)
 * preserves the *opposite* edge, not the size. For example, if x=2
 * and width=10, then setting `left = 5` keeps the right edge at 12,
 * shrinking the width to 7. The `top` setter behaves symmetrically.
 */
export class Rectangle {
  public height = 0;
  public width = 0;
  public x = 0;
  public y = 0;

  constructor(x?: number, y?: number, width?: number, height?: number) {
    if (x !== undefined) this.x = x;
    if (y !== undefined) this.y = y;
    if (width !== undefined) this.width = width;
    if (height !== undefined) this.height = height;
  }

  public get bottom(): number {
    return this.y + this.height;
  }
  public set bottom(value: number) {
    this.height = value - this.top;
  }

  public get left(): number {
    return this.x;
  }
  public set left(value: number) {
    // Preserves the right edge: read right first, then move x.
    this.width = this.right - value;
    this.x = value;
  }

  public get right(): number {
    return this.x + this.width;
  }
  public set right(value: number) {
    this.width = value - this.left;
  }

  public get top(): number {
    return this.y;
  }
  public set top(value: number) {
    // Preserves the bottom edge: read bottom first, then move y.
    this.height = this.bottom - value;
    this.y = value;
  }
}
