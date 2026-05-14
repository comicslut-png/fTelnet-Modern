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
 * Current viewport / clipping rectangle for `Graph`.
 *
 * The viewport defines:
 *   - The drawing area in pixels (x1, y1) to (x2, y2)
 *   - Whether drawing outside this area is clipped
 *   - Convenience offsets (`FromBottom`, `FromLeft`, etc.) describing
 *     where the viewport sits relative to the full screen
 *
 * Defaults are the standard BGI EGA-VGA full-screen viewport
 * (640×350 in 16-color mode).
 *
 * The original's `TODO make getter/setters to update these?` comment
 * about the From* fields is preserved here — they're maintained by
 * `Graph.SetViewPort` rather than auto-derived from x1/x2/y1/y2.
 * Phase 3 might refactor this if anything outside Graph reads it.
 */
export class ViewPortSettings {
  public x1 = 0;
  public y1 = 0;
  public x2 = 639;
  public y2 = 349;
  public Clip = true;

  // Convenience cached offsets — maintained by Graph.SetViewPort.
  public FromBottom = 0;
  public FromLeft = 0;
  public FromRight = 0;
  public FromTop = 0;
  public FullScreen = true;
}
