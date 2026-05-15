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
 * States of the YMODEM-G upload state machine.
 *
 * Transitions:
 *   - `WaitingForHeaderRequest` → got `G` from receiver →
 *     `WaitingForHeaderAck` (after sending header)
 *   - `WaitingForHeaderAck` → got `ACK` → `WaitingForFileRequest`,
 *      or got `G` (Async PRO quirk: no header ACK, treat as file
 *      request) → `SendingData`
 *   - `WaitingForFileRequest` → got `G` → `SendingData`
 *   - `SendingData` → whole file sent → `WaitingForFileAck` (after
 *      sending EOT)
 *   - `WaitingForFileAck` → got `ACK` → back to `WaitingForHeaderRequest`,
 *      or `NAK` → re-send EOT and stay
 */
export enum YModemSendState {
  WaitingForHeaderRequest,
  WaitingForHeaderAck,
  WaitingForFileRequest,
  SendingData,
  WaitingForFileAck,
}
