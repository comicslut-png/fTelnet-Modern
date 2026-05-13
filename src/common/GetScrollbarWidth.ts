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
 * Compute the platform's scrollbar width by measuring a temporary DOM
 * element. Cached after first computation.
 *
 * Phase 1 migration notes:
 *   - Removed the stale `msOverflowStyle` TODO. Modern browsers report
 *     accurate offsetWidth without that hint.
 *   - Logic is otherwise unchanged.
 */
export class GetScrollbarWidth {
  private static _width: number | undefined;

  public static get Width(): number {
    if (this._width === undefined) {
      const outer = document.createElement('div');
      outer.style.visibility = 'hidden';
      outer.style.width = '100px';
      document.body.appendChild(outer);

      const widthNoScroll = outer.offsetWidth;
      outer.style.overflow = 'scroll';

      const inner = document.createElement('div');
      inner.style.width = '100%';
      outer.appendChild(inner);

      const widthWithScroll = inner.offsetWidth;
      outer.parentNode?.removeChild(outer);

      this._width = widthNoScroll - widthWithScroll;
    }
    return this._width;
  }
}
