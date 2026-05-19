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
 * Tests for <f-transfer-progress>.
 *
 * Covers:
 *   - Visibility gating (renders nothing when hidden)
 *   - Property → DOM-content mapping (file name, byte counts, etc.)
 *   - The post-completion linger emits transfer-linger-done after ~1500ms
 *   - ESC keypress dispatches transfer-abort with reason='user'
 *   - Clicking the "Press ESC to abort" hint also dispatches abort
 *     (mobile/touch fallback)
 *
 * Phase 4 Stage 7.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import '@components/FTransferProgress.js';
import type {
  FTransferProgress,
  TransferAbortDetail,
} from '@components/index.js';
import type { TransferProgressSnapshot } from '@filetransfer/TransferStats.js';

describe('<f-transfer-progress>', () => {
  let container: HTMLDivElement;
  let el: FTransferProgress;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    el = document.createElement('f-transfer-progress') as FTransferProgress;
    container.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('default state', () => {
    it('registers as a custom element', () => {
      expect(customElements.get('f-transfer-progress')).toBeDefined();
    });

    it('has sensible defaults for all reactive properties', () => {
      expect(el.visible).toBe(false);
      expect(el.protocolName).toBe('ZMODEM');
      expect(el.fileName).toBe('');
      expect(el.fileNumber).toBe(1);
      expect(el.filesInBatch).toBe(1);
      expect(el.snapshot).toBeNull();
      expect(el.statusMessage).toBe('');
      expect(el.errorCount).toBe(0);
    });

    it('renders nothing when not visible', () => {
      expect(el.querySelector('.fTelnetTransferProgress')).toBeNull();
    });
  });

  describe('visible rendering', () => {
    beforeEach(async () => {
      el.visible = true;
      el.protocolName = 'ZMODEM-CRC32';
      el.fileName = 'AP231216.ZIP';
      el.fileNumber = 1;
      el.filesInBatch = 3;
      el.snapshot = {
        bytesReceived: 10752,
        totalBytes: 28290,
        fraction: 10752 / 28290,
        cps: 24569,
        elapsedSeconds: 5,
        etaSeconds: 32,
      };
      await el.updateComplete;
    });

    it('renders the backdrop + panel', () => {
      const backdrop = el.querySelector<HTMLElement>(
        '.fTelnetTransferProgress',
      );
      expect(backdrop).not.toBeNull();
      const panel = el.querySelector<HTMLElement>(
        '.fTelnetTransferProgressPanel',
      );
      expect(panel).not.toBeNull();
    });

    it('shows the protocol name in the top border', () => {
      // The protocol name is wrapped in <span style="color: #ffff55">…</span>
      // Find any text node containing the protocol name.
      const text = el.textContent ?? '';
      expect(text).toContain('ZMODEM-CRC32');
    });

    it('renders the file count and name in the title line', () => {
      const text = el.textContent ?? '';
      expect(text).toContain('File 1 of 3');
      expect(text).toContain('AP231216.ZIP');
    });

    it('formats the size with thousand separators', () => {
      const text = el.textContent ?? '';
      expect(text).toContain('28,290 bytes');
    });

    it('shows current/total byte counts', () => {
      const text = el.textContent ?? '';
      expect(text).toContain('10,752 / 28,290');
    });

    it('shows the elapsed time and ETA in HH:MM:SS format', () => {
      const text = el.textContent ?? '';
      expect(text).toContain('00:00:05'); // elapsed
      expect(text).toContain('00:00:32'); // ETA
    });

    it('shows the CPS rate', () => {
      const text = el.textContent ?? '';
      expect(text).toContain('24,569');
    });

    it('shows the percentage', () => {
      const text = el.textContent ?? '';
      expect(text).toContain('38%'); // 10752 / 28290 = ~38.0%
    });

    it('shows the abort hint', () => {
      const text = el.textContent ?? '';
      expect(text).toContain('Press ESC/CTRL-X or click here');
    });

    it("renders '---' for unknown CPS when snapshot.cps is null", async () => {
      el.snapshot = {
        bytesReceived: 0,
        totalBytes: 28290,
        fraction: 0,
        cps: null,
        elapsedSeconds: 0,
        etaSeconds: null,
      };
      await el.updateComplete;
      const text = el.textContent ?? '';
      // Among the CPS column, expect "---"
      expect(text).toMatch(/CPS:\s+---/);
    });
  });

  describe('truncation', () => {
    it('truncates absurdly long filenames with an ellipsis', async () => {
      el.visible = true;
      el.fileName = 'A_RIDICULOUSLY_LONG_FILENAME_THAT_GOES_FOREVER_AND_EVER.ZIP';
      await el.updateComplete;
      const text = el.textContent ?? '';
      expect(text).toContain('…');
    });
  });

  describe('abort flow', () => {
    let abortDetail: TransferAbortDetail | null = null;

    beforeEach(async () => {
      abortDetail = null;
      el.addEventListener('transfer-abort', (ev) => {
        abortDetail = (ev as CustomEvent<TransferAbortDetail>).detail;
      });
      el.visible = true;
      await el.updateComplete;
    });

    it('dispatches transfer-abort on ESC keypress', () => {
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      window.dispatchEvent(event);
      expect(abortDetail).toEqual({ reason: 'user' });
    });

    it('does not dispatch transfer-abort on ESC when not visible', async () => {
      el.visible = false;
      await el.updateComplete;
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      window.dispatchEvent(event);
      expect(abortDetail).toBeNull();
    });

    it('dispatches transfer-abort when the abort hint is clicked', () => {
      const hint = el.querySelector<HTMLElement>('[role="button"]');
      expect(hint).not.toBeNull();
      hint!.click();
      expect(abortDetail).toEqual({ reason: 'user' });
    });
  });

  describe('completion linger', () => {
    it('emits transfer-linger-done ~1500ms after markComplete()', async () => {
      vi.useFakeTimers();
      try {
        el.visible = true;
        await el.updateComplete;

        let lingerDone = false;
        el.addEventListener('transfer-linger-done', () => {
          lingerDone = true;
        });
        el.markComplete();

        // Right after markComplete, the panel should re-render with
        // the "Complete!" line. Let Lit update.
        await el.updateComplete;
        const text = el.textContent ?? '';
        expect(text).toContain('Complete!');

        // Advance time just shy of the linger duration.
        vi.advanceTimersByTime(1499);
        expect(lingerDone).toBe(false);

        // Cross the threshold.
        vi.advanceTimersByTime(2);
        expect(lingerDone).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('pins the bar at 100% during the complete state', async () => {
      el.visible = true;
      el.snapshot = {
        bytesReceived: 5000,
        totalBytes: 10000,
        fraction: 0.5,
        cps: 1000,
        elapsedSeconds: 5,
        etaSeconds: 5,
      };
      await el.updateComplete;
      el.markComplete();
      await el.updateComplete;
      const text = el.textContent ?? '';
      // "100%" should now appear (not "50%")
      expect(text).toContain('100%');
    });
  });

  describe('status message', () => {
    it('shows the message when statusMessage is set', async () => {
      el.visible = true;
      el.statusMessage = 'CRC error, retransmitting';
      await el.updateComplete;
      const text = el.textContent ?? '';
      expect(text).toContain('CRC error, retransmitting');
    });

    it('hides the status row when message is empty', async () => {
      el.visible = true;
      el.statusMessage = '';
      await el.updateComplete;
      // Hard to assert "row hidden" — just confirm no orphan text
      const text = el.textContent ?? '';
      expect(text).not.toMatch(/CRC error/);
    });
  });

  describe('handles snapshot=null gracefully', () => {
    it('renders placeholder values when no snapshot has arrived yet', async () => {
      el.visible = true;
      el.fileName = 'somefile.bin';
      el.snapshot = null;
      await el.updateComplete;
      const text = el.textContent ?? '';
      // Time placeholder
      expect(text).toContain('--:--:--');
      // Bar empty, percentage placeholder
      expect(text).toMatch(/---%/);
    });
  });

  /**
   * Regression coverage for the Stage 7 layout disaster.
   *
   * The first Stage 7 implementation used a `<div>` per line with
   * `white-space: pre` on each div. The literal newlines and
   * indentation in the lit template — needed for readable source
   * code — got preserved as visible content, blowing each row up
   * to ~5 lines tall and making the column alignment drift wildly.
   * Users saw a panel that was way too tall, with `│` characters
   * floating at random horizontal positions.
   *
   * The fix replaced the per-row divs with a single `<pre>` element
   * containing all line content joined by explicit '\n' characters,
   * with no literal whitespace between adjacent template expressions.
   *
   * These tests pin the invariants that prevent recurrence:
   *
   *   1. The panel renders inside a single `<pre>` element (not
   *      stacked divs).
   *   2. Every line of the panel is exactly PANEL_INNER_WIDTH+2
   *      characters wide (52+2 = 54). If any line drifts, layout
   *      is broken.
   *   3. The line count is exactly what the design specifies
   *      (11 lines normally, 12 with a status message).
   *   4. The top and bottom borders use the correct corner glyphs
   *      and the side borders use the correct vertical glyphs.
   */
  describe('layout regression (Stage 7 fix)', () => {
    /**
     * Helper: get the panel's text content split into lines.
     * Returns an empty array if the panel isn't rendered.
     */
    function getPanelLines(): string[] {
      const pre = el.querySelector<HTMLElement>(
        '.fTelnetTransferProgressPanel',
      );
      if (pre === null) return [];
      return (pre.textContent ?? '').split('\n');
    }

    it('renders the panel inside a single <pre> element', async () => {
      el.visible = true;
      await el.updateComplete;
      const preElements = el.querySelectorAll(
        '.fTelnetTransferProgressPanel',
      );
      expect(preElements.length).toBe(1);
      expect(preElements[0]!.tagName).toBe('PRE');
    });

    it('renders no extra per-row divs (the old buggy layout)', async () => {
      el.visible = true;
      await el.updateComplete;
      // The whole panel content lives inside the single <pre>.
      // The backdrop is one outer <div> (positioned overlay).
      // No other divs should exist as children of the backdrop.
      const backdrop = el.querySelector<HTMLElement>(
        '.fTelnetTransferProgress',
      );
      expect(backdrop).not.toBeNull();
      const directDivChildren = backdrop!.querySelectorAll(':scope > div');
      expect(directDivChildren.length).toBe(0);
    });

    it('produces exactly 11 lines in default (no status message) state', async () => {
      el.visible = true;
      el.protocolName = 'ZMODEM-CRC32';
      el.fileName = 'test.zip';
      el.snapshot = {
        bytesReceived: 1000,
        totalBytes: 10000,
        fraction: 0.1,
        cps: 500,
        elapsedSeconds: 2,
        etaSeconds: 18,
      };
      await el.updateComplete;
      const lines = getPanelLines();
      expect(lines.length).toBe(11);
    });

    it('produces exactly 12 lines when statusMessage is set', async () => {
      el.visible = true;
      el.statusMessage = 'Working on it';
      await el.updateComplete;
      const lines = getPanelLines();
      expect(lines.length).toBe(12);
    });

    it('renders every line at exactly 54 characters wide', async () => {
      el.visible = true;
      el.protocolName = 'ZMODEM-CRC32';
      el.fileName = 'AP231216.ZIP';
      el.fileNumber = 1;
      el.filesInBatch = 3;
      el.snapshot = {
        bytesReceived: 10752,
        totalBytes: 28290,
        fraction: 10752 / 28290,
        cps: 24569,
        elapsedSeconds: 5,
        etaSeconds: 32,
      };
      await el.updateComplete;
      const lines = getPanelLines();
      // EVERY line — top border, content rows, empty rows, bar
      // row, abort hint, bottom border — must be identical width.
      // Mismatched widths in earlier versions revealed the
      // template-whitespace bug.
      for (let i = 0; i < lines.length; i++) {
        expect(
          lines[i]!.length,
          `Line ${i} has unexpected width: |${lines[i]}|`,
        ).toBe(54);
      }
    });

    it('maintains 54-char width across all snapshot edge cases', async () => {
      el.visible = true;
      // Initial state: snapshot null
      el.snapshot = null;
      await el.updateComplete;
      for (const line of getPanelLines()) expect(line.length).toBe(54);

      // Mid-transfer
      el.snapshot = {
        bytesReceived: 5000,
        totalBytes: 999999999,
        fraction: 0.000005,
        cps: 100000,
        elapsedSeconds: 0.5,
        etaSeconds: 9999,
      };
      await el.updateComplete;
      for (const line of getPanelLines()) expect(line.length).toBe(54);

      // Complete state
      el.markComplete();
      await el.updateComplete;
      for (const line of getPanelLines()) expect(line.length).toBe(54);

      // With status message
      el.statusMessage = 'A short message';
      await el.updateComplete;
      for (const line of getPanelLines()) expect(line.length).toBe(54);

      // With a very long status message that gets truncated
      el.statusMessage = 'A very long status message that should be truncated with an ellipsis';
      await el.updateComplete;
      for (const line of getPanelLines()) expect(line.length).toBe(54);
    });

    it('uses the correct box-drawing characters at corners', async () => {
      el.visible = true;
      el.protocolName = 'ZMODEM';
      await el.updateComplete;
      const lines = getPanelLines();
      // Top border begins ┌ and ends ┐
      expect(lines[0]!.startsWith('┌')).toBe(true);
      expect(lines[0]!.endsWith('┐')).toBe(true);
      // Bottom border begins └ and ends ┘
      expect(lines[lines.length - 1]!.startsWith('└')).toBe(true);
      expect(lines[lines.length - 1]!.endsWith('┘')).toBe(true);
      // Every interior line begins and ends with │
      for (let i = 1; i < lines.length - 1; i++) {
        expect(
          lines[i]!.startsWith('│'),
          `Line ${i} should start with │: ${lines[i]}`,
        ).toBe(true);
        expect(
          lines[i]!.endsWith('│'),
          `Line ${i} should end with │: ${lines[i]}`,
        ).toBe(true);
      }
    });

    it('includes the protocol name in the top border', async () => {
      el.visible = true;
      el.protocolName = 'ZMODEM-CRC32';
      await el.updateComplete;
      const lines = getPanelLines();
      expect(lines[0]).toContain('ZMODEM-CRC32');
      // No matter how long the name is, top border still fills to 54
      expect(lines[0]!.length).toBe(54);
    });

    it('handles very long protocol names gracefully', async () => {
      el.visible = true;
      el.protocolName = 'ZMODEM-CRC32-WITH-FAKE-LONG-SUFFIX';
      await el.updateComplete;
      const lines = getPanelLines();
      // Top border may overflow if name is too long, but should
      // never be SHORTER than expected (we only `Math.max(0, ...)`
      // the dash count, never negative).
      expect(lines[0]!.length).toBeGreaterThanOrEqual(54);
    });
  });

  /**
   * Coverage for the Stage 7 fixes follow-up:
   *
   *   - Errors counter (replacing the old Efficiency placeholder)
   *   - CTRL+X as alternate abort hotkey (alongside ESC)
   *   - The keystroke MUST propagate to other listeners so the
   *     keystroke also reaches the BBS as terminal input — that's
   *     what SEXYZ actually responds to. (Earlier in Stage 7 this
   *     was the opposite: we stopped propagation thinking it was
   *     interfering with the BBS. It turned out we needed it.)
   */
  describe('Stage 7 fixes — error count + CTRL-X', () => {
    it('displays the errorCount in the Errors column', async () => {
      el.visible = true;
      el.errorCount = 0;
      await el.updateComplete;
      expect(el.textContent ?? '').toMatch(/Errors:\s+0\b/);
      el.errorCount = 7;
      await el.updateComplete;
      expect(el.textContent ?? '').toMatch(/Errors:\s+7\b/);
    });

    it('does NOT display the old "Efficiency:" label', async () => {
      el.visible = true;
      await el.updateComplete;
      expect(el.textContent ?? '').not.toContain('Efficiency');
    });

    it('shows both ESC and CTRL-X in the abort hint', async () => {
      el.visible = true;
      await el.updateComplete;
      const text = el.textContent ?? '';
      expect(text).toContain('Press ESC/CTRL-X or click here');
    });

    it('dispatches transfer-abort on CTRL+X', () => {
      let dispatched = false;
      el.addEventListener('transfer-abort', () => {
        dispatched = true;
      });
      el.visible = true;
      const event = new KeyboardEvent('keydown', {
        key: 'x',
        ctrlKey: true,
      });
      window.dispatchEvent(event);
      expect(dispatched).toBe(true);
    });

    it('also dispatches transfer-abort on uppercase CTRL+X', () => {
      let dispatched = false;
      el.addEventListener('transfer-abort', () => {
        dispatched = true;
      });
      el.visible = true;
      const event = new KeyboardEvent('keydown', {
        key: 'X',
        ctrlKey: true,
      });
      window.dispatchEvent(event);
      expect(dispatched).toBe(true);
    });

    it('does NOT dispatch transfer-abort on plain X (no ctrl)', () => {
      let dispatched = false;
      el.addEventListener('transfer-abort', () => {
        dispatched = true;
      });
      el.visible = true;
      const event = new KeyboardEvent('keydown', { key: 'x' });
      window.dispatchEvent(event);
      expect(dispatched).toBe(false);
    });

    it('lets ESC propagate to other listeners (so it reaches the BBS)', () => {
      // Set up a second window listener that simulates the Crt's
      // keydown forwarder. Our handler MUST allow propagation so
      // this listener fires too. This is critical for SEXYZ on
      // Synchronet to actually abort: SEXYZ responds to literal
      // CAN bytes in the terminal-input channel, not just the
      // protocol-channel CAN storm.
      let downstreamFired = false;
      const fakeCrtHandler = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') downstreamFired = true;
      };
      window.addEventListener('keydown', fakeCrtHandler);
      try {
        el.visible = true;
        const event = new KeyboardEvent('keydown', {
          key: 'Escape',
          cancelable: true,
        });
        window.dispatchEvent(event);
        expect(downstreamFired).toBe(true);
      } finally {
        window.removeEventListener('keydown', fakeCrtHandler);
      }
    });

    it('lets CTRL+X propagate to other listeners (so it reaches the BBS)', () => {
      let downstreamFired = false;
      const fakeCrtHandler = (e: KeyboardEvent): void => {
        if (e.ctrlKey && e.key.toLowerCase() === 'x') downstreamFired = true;
      };
      window.addEventListener('keydown', fakeCrtHandler);
      try {
        el.visible = true;
        const event = new KeyboardEvent('keydown', {
          key: 'x',
          ctrlKey: true,
          cancelable: true,
        });
        window.dispatchEvent(event);
        expect(downstreamFired).toBe(true);
      } finally {
        window.removeEventListener('keydown', fakeCrtHandler);
      }
    });
  });

  describe('direction property (Phase 5 Delta 2)', () => {
    /**
     * The direction property controls the verb in the panel title:
     *   - 'receive' (default) → "Receiving File N of M: filename"
     *   - 'send'             → "Sending File N of M: filename"
     *
     * Receive is the default because Phase 4 only had receive; the
     * property is purely additive for upload support.
     */
    it('defaults to receive', () => {
      expect(el.direction).toBe('receive');
    });

    it('renders "Receiving" in the title when direction is receive', async () => {
      el.visible = true;
      el.fileName = 'kitten.zip';
      el.direction = 'receive';
      await el.updateComplete;
      const text = el.textContent ?? '';
      expect(text).toContain('Receiving File');
      expect(text).toContain('kitten.zip');
      expect(text).not.toContain('Sending File');
    });

    it('renders "Sending" in the title when direction is send', async () => {
      el.visible = true;
      el.fileName = 'puppy.zip';
      el.direction = 'send';
      await el.updateComplete;
      const text = el.textContent ?? '';
      expect(text).toContain('Sending File');
      expect(text).toContain('puppy.zip');
      expect(text).not.toContain('Receiving File');
    });

    it('switching direction at runtime re-renders the title', async () => {
      el.visible = true;
      el.fileName = 'thing.zip';
      el.direction = 'receive';
      await el.updateComplete;
      expect(el.textContent).toContain('Receiving File');

      el.direction = 'send';
      await el.updateComplete;
      expect(el.textContent).toContain('Sending File');
      expect(el.textContent).not.toContain('Receiving File');
    });
  });
});
