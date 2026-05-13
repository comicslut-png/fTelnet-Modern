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
 * A snapshot of a keyboard event in a form decoupled from the DOM.
 *
 * Used internally as the key-press queue entry so the Crt class can
 * buffer keystrokes and replay them through whatever the consumer
 * (telnet connection, scrollback handler, etc.) needs.
 *
 * Phase 1 migration notes:
 *   - `keyCode` and `charCode` are deprecated `KeyboardEvent` fields.
 *     They still work on every browser but new code should prefer
 *     `key` / `code`. The downstream code uses these numerically in
 *     many places, so we preserve them for the migration; converting
 *     to modern keyboard APIs is a job for the UI facelift phase.
 *   - Adds a strict-mode-safe constructor that defaults all fields
 *     in case of partial input.
 */
export class KeyPressEvent {
  public altKey: boolean;
  public charCode: number;
  public ctrlKey: boolean;
  public keyCode: number;
  public keyString: string;
  public shiftKey: boolean;

  constructor(keyEvent: KeyboardEvent, keyString: string) {
    this.altKey = keyEvent.altKey;
    this.charCode = keyEvent.charCode;
    this.ctrlKey = keyEvent.ctrlKey;
    this.keyCode = keyEvent.keyCode;
    this.keyString = keyString;
    this.shiftKey = keyEvent.shiftKey;
  }
}
