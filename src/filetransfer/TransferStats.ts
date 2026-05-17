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
 * Stats engine for the file-transfer progress panel.
 *
 * Takes a stream of `update(bytesReceived, totalBytes)` calls from
 * ZModemReceive and produces derived statistics — CPS, ETA, elapsed
 * time, percentage — for the progress UI to display.
 *
 * Why this is a separate class:
 *   1. Raw instantaneous CPS is too jittery. Subpackets arrive in
 *      bursty WebSocket reads; "bytes since last update / time since
 *      last update" can show 800,000 CPS for one frame and 5,000 the
 *      next. A rolling-window average smooths this out so the panel
 *      shows a stable number that actually reflects throughput.
 *   2. The math is testable without a DOM. Vitest can hammer this
 *      class with synthetic update sequences and verify the derived
 *      values; the UI component just renders whatever this produces.
 *   3. Both renderers (in-canvas + html-overlay, per the design doc)
 *      share the same stats source. Each renderer wraps a single
 *      TransferStats and reads from it.
 *
 * The rolling-CPS window defaults to 5 seconds, which is long enough
 * that one bursty network read won't spike the displayed number, and
 * short enough that the ETA responds within a few seconds when the
 * actual rate changes (e.g., a slow proxy hop suddenly speeds up).
 *
 * Phase 4 Stage 7.
 */

/**
 * Snapshot of derived stats at a moment in time. Renderers consume
 * this and display the formatted strings.
 *
 * `null` values mean "not enough data to compute yet" — the renderer
 * should show a placeholder like `--:--` or `???`. This typically
 * happens for the first few hundred milliseconds of a transfer
 * before the rolling-CPS window has any data.
 */
export interface TransferProgressSnapshot {
  /** Bytes received so far for the current file. */
  bytesReceived: number;
  /** Sender-announced total bytes, or 0 if unknown. */
  totalBytes: number;
  /**
   * 0.0 - 1.0 progress through the current file. If `totalBytes`
   * is 0 (sender didn't announce size) this is null and the renderer
   * should show an indeterminate bar.
   */
  fraction: number | null;
  /** Smoothed characters-per-second rate over the rolling window. */
  cps: number | null;
  /** Seconds since the file transfer started. */
  elapsedSeconds: number;
  /**
   * Seconds remaining at the current rate. Null when CPS is unknown
   * or totalBytes is 0. Capped at a sensible upper bound (24h) so
   * a stalled stream doesn't display an absurd ETA.
   */
  etaSeconds: number | null;
}

/**
 * Pure stats engine. No DOM, no timers — the caller drives it with
 * `update()` calls (typically from ZModemReceive.onProgress).
 *
 * The caller can also poll `snapshot(now?)` at any time to get the
 * latest derived values; the snapshot is computed lazily so polling
 * costs only a few math operations.
 */
export class TransferStats {
  /** Wall-clock time when the current file's transfer began. */
  private _startedAt: number;
  /** Most recent (timestamp, cumulativeBytes) datapoint. */
  private _samples: Array<{ t: number; bytes: number }> = [];
  /** Maximum window length in milliseconds for the rolling average. */
  private readonly _windowMs: number;
  /** Most recent received-byte count. */
  private _bytesReceived = 0;
  /** Sender-announced total (0 if unknown). */
  private _totalBytes = 0;

  /**
   * @param windowMs  How many milliseconds of history to include in
   *   the rolling CPS average. Default 5,000ms. Smaller values
   *   produce more responsive but noisier rates; larger values
   *   produce smoother but laggier rates.
   * @param nowMs  Optional initial timestamp (for testing). Defaults
   *   to `performance.now()`.
   */
  public constructor(windowMs = 5_000, nowMs?: number) {
    this._windowMs = windowMs;
    this._startedAt = nowMs ?? TransferStats.now();
    this._samples.push({ t: this._startedAt, bytes: 0 });
  }

  /** Reset for a new file. Call between files in a multi-file batch. */
  public reset(totalBytes: number, nowMs?: number): void {
    this._startedAt = nowMs ?? TransferStats.now();
    this._bytesReceived = 0;
    this._totalBytes = totalBytes;
    this._samples = [{ t: this._startedAt, bytes: 0 }];
  }

  /**
   * Feed a progress update. Called once per ZMODEM subpacket from
   * `ZModemReceive.onProgress`. `bytesReceived` should be the
   * monotonically-increasing cumulative byte count for the current
   * file; `totalBytes` is the sender-announced size (0 = unknown).
   */
  public update(bytesReceived: number, totalBytes: number, nowMs?: number): void {
    const now = nowMs ?? TransferStats.now();
    this._bytesReceived = bytesReceived;
    this._totalBytes = totalBytes;
    this._samples.push({ t: now, bytes: bytesReceived });
    this.trimSamples(now);
  }

  /** Drop samples older than the rolling window. */
  private trimSamples(now: number): void {
    const cutoff = now - this._windowMs;
    // Keep at least the most recent sample even if it's older than
    // the cutoff (a stalled transfer where no new updates arrived
    // for a while — we still want to compute against the last datum).
    let firstFresh = 0;
    for (let i = 0; i < this._samples.length; i++) {
      if (this._samples[i]!.t >= cutoff) {
        firstFresh = i;
        break;
      }
      firstFresh = i;
    }
    if (firstFresh > 0) {
      this._samples.splice(0, firstFresh);
    }
  }

  /**
   * Compute the current derived stats. Renderers call this on a
   * fixed timer (e.g., requestAnimationFrame or setInterval at
   * ~10 Hz) and update the DOM with the result.
   */
  public snapshot(nowMs?: number): TransferProgressSnapshot {
    const now = nowMs ?? TransferStats.now();
    const elapsedSeconds = (now - this._startedAt) / 1000;
    const fraction =
      this._totalBytes > 0 ? this._bytesReceived / this._totalBytes : null;

    const cps = this.computeCps(now);
    let etaSeconds: number | null = null;
    if (cps !== null && cps > 0 && this._totalBytes > 0) {
      const remaining = Math.max(0, this._totalBytes - this._bytesReceived);
      etaSeconds = Math.min(24 * 60 * 60, remaining / cps);
    }

    return {
      bytesReceived: this._bytesReceived,
      totalBytes: this._totalBytes,
      fraction,
      cps,
      elapsedSeconds,
      etaSeconds,
    };
  }

  /**
   * Average bytes/second over the rolling window. Returns null if
   * we don't have two distinct samples yet (just-started state).
   */
  private computeCps(now: number): number | null {
    if (this._samples.length < 2) return null;
    const oldest = this._samples[0]!;
    const newest = this._samples[this._samples.length - 1]!;
    // If the newest sample is older than ~200ms, use `now` for the
    // denominator so a stalled stream's CPS decays toward zero
    // instead of freezing at its last value.
    const endT = Math.max(newest.t, now - 0);
    const dtSec = (endT - oldest.t) / 1000;
    if (dtSec <= 0) return null;
    const dBytes = newest.bytes - oldest.bytes;
    if (dBytes < 0) return null;
    return dBytes / dtSec;
  }

  /** Test seam — vitest overrides this for deterministic time. */
  private static now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }
}

/**
 * Format byte counts with thousands separators for the panel.
 * SyncTERM uses comma-grouped decimals (US convention); we follow
 * suit since the retro aesthetic matters more than locale here.
 *
 * Examples:
 *   formatBytes(0)       → "0"
 *   formatBytes(1024)    → "1,024"
 *   formatBytes(28290)   → "28,290"
 *   formatBytes(1234567) → "1,234,567"
 */
export function formatBytes(n: number): string {
  // toLocaleString('en-US') would also work but pulls in ICU at
  // bundle time on some engines. A two-line manual implementation
  // is smaller and deterministic.
  const s = Math.floor(Math.max(0, n)).toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format an integer CPS for the panel. SyncTERM shows raw CPS as
 * a comma-grouped integer (no decimal places, no "K" suffix until
 * you exceed displayable width). Stays faithful.
 *
 * Returns "---" for null (still computing).
 */
export function formatCps(cps: number | null): string {
  if (cps === null) return '---';
  return formatBytes(Math.round(cps));
}

/**
 * Format an HH:MM:SS duration. Caps at 99:59:59 — anything longer
 * is shown as ">99:00:00" to avoid layout surprises in the panel.
 *
 * Examples:
 *   formatTime(0)      → "00:00:00"
 *   formatTime(5)      → "00:00:05"
 *   formatTime(125)    → "00:02:05"
 *   formatTime(7384)   → "02:03:04"
 *   formatTime(null)   → "--:--:--"
 */
export function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '--:--:--';
  const s = Math.max(0, Math.floor(seconds));
  if (s >= 100 * 3600) return '>99:00:00';
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return (
    hh.toString().padStart(2, '0') +
    ':' +
    mm.toString().padStart(2, '0') +
    ':' +
    ss.toString().padStart(2, '0')
  );
}

/**
 * Format a 0.0-1.0 fraction as a percentage integer with `%`.
 * Returns `---%` for null. Caps at 100% even if fraction > 1.0
 * (which can happen if sender announces a wrong size).
 *
 * Examples:
 *   formatPercent(0)     → "0%"
 *   formatPercent(0.38)  → "38%"
 *   formatPercent(1.0)   → "100%"
 *   formatPercent(null)  → "---%"
 */
export function formatPercent(fraction: number | null): string {
  if (fraction === null) return '---%';
  const pct = Math.min(100, Math.max(0, Math.floor(fraction * 100)));
  return pct + '%';
}
