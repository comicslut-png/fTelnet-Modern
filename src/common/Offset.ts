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

import { Point } from './Point.js';

/**
 * Compute the absolute page offset of an element.
 *
 * Phase 1 migration notes:
 *   - The original had two implementations (rect-based and offsetParent-
 *     walking) with a feature check between them. Every browser we support
 *     has `getBoundingClientRect`, so we drop the fallback.
 *   - Converted from TypeScript `module` syntax (deprecated namespace style)
 *     to a regular exported function.
 */
export function getOffset(elem: HTMLElement): Point {
  const box = elem.getBoundingClientRect();
  const docElem = document.documentElement;

  const scrollTop = window.pageYOffset || docElem.scrollTop;
  const scrollLeft = window.pageXOffset || docElem.scrollLeft;
  const clientTop = docElem.clientTop;
  const clientLeft = docElem.clientLeft;

  return new Point(
    Math.round(box.left + scrollLeft - clientLeft),
    Math.round(box.top + scrollTop - clientTop)
  );
}
