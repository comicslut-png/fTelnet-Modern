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
 * Simple cumulative-time benchmark used for tuning the render loop and
 * ANSI parser. Most call sites in the original code are commented-out
 * debug instrumentation — we keep this around for that use.
 *
 * Phase 1 migration notes:
 *   - With `strictPropertyInitialization`, `_StartTime`/`_StopTime` need
 *     definite defaults. Initialized to 0 (matching the "not yet started"
 *     semantics the original relied on).
 */
export class Benchmark {
  private _cumulativeElapsed = 0;
  private _startTime = 0;
  private _stopTime = 0;

  public get CumulativeElapsed(): number | undefined {
    return this._cumulativeElapsed > 0 ? this._cumulativeElapsed : undefined;
  }

  public get Elapsed(): number | undefined {
    return this._stopTime > 0 ? this._stopTime - this._startTime : undefined;
  }

  public Reset(): void {
    this._cumulativeElapsed = 0;
  }

  public Start(): void {
    this._startTime = performance.now();
    this._stopTime = 0;
  }

  public Stop(): void {
    if (this._startTime > 0) {
      this._stopTime = performance.now();
      const elapsed = this.Elapsed;
      if (elapsed !== undefined) {
        this._cumulativeElapsed += elapsed;
      }
    }
  }
}
