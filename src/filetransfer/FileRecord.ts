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

import { ByteArray } from '../common/index.js';

/**
 * A single file in a YMODEM batch transfer.
 *
 * The name and size are fixed at construction; the data buffer
 * accumulates as bytes arrive (for receive) or drains as bytes are
 * sent (for upload). The `size` is the *expected* size, set from the
 * YMODEM header packet — it doesn't necessarily match
 * `data.length` until the transfer completes.
 *
 * Pure dataclass; no behavior. Migrated as-is.
 */
export class FileRecord {
  private readonly _Data: ByteArray = new ByteArray();
  private readonly _Name: string;
  private readonly _Size: number;

  constructor(name: string, size: number) {
    this._Name = name;
    this._Size = size;
  }

  public get data(): ByteArray {
    return this._Data;
  }

  public get name(): string {
    return this._Name;
  }

  public get size(): number {
    return this._Size;
  }
}
