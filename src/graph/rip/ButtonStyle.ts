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
 * Visual styling for a RIPscrip button (set via the `|1B` Button Style
 * command and consumed by the `|1U` Button command).
 *
 * The original RIP source's TODO note about this struct: "shouldn't
 * use ints for things that don't make sense, should add additional
 * fields to expand flags". Preserved as-is — refactoring this into
 * a proper structured type would force changes throughout RIP.ts.
 *
 * Flag bits (`flags` field) used by `Button` in RIP.ts:
 *   - 1     (0x001) clipboard type — Button() returns early
 *   - 8     (0x008) chisel inset
 *   - 16    (0x010) recessed
 *   - 32    (0x020) drop shadow under label
 *   - 128   (0x080) icon type — Button() returns early
 *   - 512   (0x200) bevel
 *   - 1024  (0x400) record as mouse field
 *   - 32768 (0x8000) sunken
 *
 * `flags2`, `groupid`, `underlinecolour` are RIPscrip extensions that
 * aren't consumed by the current Button() implementation. They're
 * stored but unused — preserved for protocol compliance.
 */
export class ButtonStyle {
  public width = 0;
  public height = 0;
  public orientation = 0;
  public flags = 0;
  public bevelsize = 0;
  public dfore = 0;
  public dback = 0;
  public bright = 0;
  public dark = 0;
  public surface = 0;
  public groupid = 0;
  public flags2 = 0;
  public underlinecolour = 0;
  public cornercolour = 0;
}
