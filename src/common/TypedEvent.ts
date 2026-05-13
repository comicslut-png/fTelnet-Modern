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
 * A lightweight typed event emitter.
 *
 * Originally based on the AS3-style event pattern used throughout fTelnet,
 * modernized to support TypeScript generics so listeners get proper type
 * checking on their arguments.
 *
 * Phase 1 migration notes:
 *   - Generic parameter `TArgs` replaces `any[]` for type safety.
 *   - Fixed a real bug in the original `off()`: the loop incremented `l`
 *     instead of `i`, meaning specific-listener removal would either
 *     loop forever or do the wrong thing depending on inputs.
 *   - Listeners are invoked on a snapshot of the array, so a listener
 *     that unregisters itself (or others) during `trigger()` won't
 *     skip neighboring listeners.
 */
export interface IEvent<TArgs extends unknown[] = unknown[]> {
  on(listener: (...args: TArgs) => void): void;
  off(listener?: (...args: TArgs) => void): void;
  trigger(...args: TArgs): void;
}

export class TypedEvent<TArgs extends unknown[] = unknown[]> implements IEvent<TArgs> {
  private _listeners: Array<(...args: TArgs) => void> = [];

  /** Register a listener for this event. */
  public on(listener: (...args: TArgs) => void): void {
    this._listeners.push(listener);
  }

  /**
   * Unregister a listener. If no listener is provided, removes all
   * listeners for this event.
   */
  public off(listener?: (...args: TArgs) => void): void {
    if (typeof listener === 'function') {
      const index = this._listeners.indexOf(listener);
      if (index !== -1) {
        this._listeners.splice(index, 1);
      }
    } else {
      this._listeners = [];
    }
  }

  /** Invoke every registered listener with the supplied arguments. */
  public trigger(...args: TArgs): void {
    // Snapshot so listeners that register/unregister during dispatch
    // don't disturb iteration.
    const snapshot = this._listeners.slice();
    for (const listener of snapshot) {
      listener(...args);
    }
  }

  /** Number of currently-registered listeners (useful for tests). */
  public get listenerCount(): number {
    return this._listeners.length;
  }
}
