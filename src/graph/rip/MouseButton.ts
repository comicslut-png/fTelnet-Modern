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

import { Rectangle } from '../Rectangle.js';

/**
 * Hot mouse region paired with the host command to send when clicked.
 *
 * Used by the RIPscrip Button (`|1U`) and Mouse (`|1M`) commands to
 * register clickable areas. The RIP parser keeps a list of these
 * and routes mousedown / hotkey events through them.
 *
 * Flag bits:
 *   - 2 (0x02) invertable — flip pixel colors during press
 *   - 4 (0x04) reset screen on click
 *
 * Other flag bits exist in `ButtonStyle.flags` but only these two
 * are stored here at the per-button level.
 */
export class MouseButton {
  private readonly _Coords: Rectangle;
  private readonly _Flags: number;
  private readonly _HostCommand: string;
  private readonly _HotKey: string;

  constructor(coords: Rectangle, hostCommand: string, flags: number, hotKey: string) {
    this._Coords = coords;
    this._HostCommand = hostCommand;
    this._Flags = flags;
    this._HotKey = hotKey;
  }

  public get Coords(): Rectangle {
    return this._Coords;
  }

  /** Reset-screen flag set? */
  public DoResetScreen(): boolean {
    return (this._Flags & 4) === 4;
  }

  public get HotKey(): string {
    return this._HotKey;
  }

  /** Invertable flag set? */
  public IsInvertable(): boolean {
    return (this._Flags & 2) === 2;
  }

  public get HostCommand(): string {
    return this._HostCommand;
  }
}
