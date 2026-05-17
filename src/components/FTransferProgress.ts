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

import { LitElement, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import {
  formatBytes,
  formatCps,
  formatPercent,
  formatTime,
  type TransferProgressSnapshot,
} from '@filetransfer/TransferStats.js';

/**
 * Detail payload for the `transfer-abort` custom event.
 *
 * Fired when the user presses ESC inside the panel (or clicks the
 * "Press ESC to abort" line — we treat that line as a button to
 * be discoverable on touch devices). The parent (`fTelnetClient`)
 * responds by calling `ZModemReceive.abort()`, which fires the
 * 8-CAN/10-BS abort sequence out-of-band.
 */
export interface TransferAbortDetail {
  /** Why the user asked to abort. Currently always 'user'. */
  reason: 'user';
}

/**
 * Inner panel width in characters (between the side `│` borders).
 * Matches the design-doc mockup's column structure. Changing this
 * requires re-flowing every line-builder method below.
 */
const PANEL_INNER_WIDTH = 52;

/**
 * Progress bar width in cells. Includes the bracket characters at
 * each end (so the actual fillable region is `BAR_WIDTH - 2`).
 */
const BAR_WIDTH = 40;

/**
 * `<f-transfer-progress>` — the retro SyncTERM-style file-transfer
 * progress panel.
 *
 * Per `docs/phase4-ui-decision.md`, the panel is deliberately NOT
 * theme-aware: hard-coded blue/yellow/cyan colors evoke the 1990s
 * DOS terminal aesthetic. The visual jolt of seeing it appear
 * mid-session is part of the experience.
 *
 * The panel is positioned center-overlay above the canvas with a
 * dim backdrop. When the transfer completes successfully the panel
 * lingers ~1.5 seconds at 100% with "Complete!" so the user sees
 * the result, then fades out.
 *
 * Layout matches the design-doc mockup:
 *
 *   ┌─ ZMODEM-CRC32 ─────────────────────────────────────┐
 *   │  Receiving File 1 of 1: filename.zip               │
 *   │  Size:        28,290 bytes                         │
 *   │  Bytes:       10,752 / 28,290                      │
 *   │  Time:        00:00:05    ETA: 00:00:32            │
 *   │  CPS:         24,569      Efficiency: ---          │
 *   │                                                    │
 *   │  [███████████████░░░░░░░░░░░░░░░░░░░] 38%          │
 *   │                                                    │
 *   │  Press ESC to abort                                │
 *   └────────────────────────────────────────────────────┘
 *
 * ── Rendering approach ──
 *
 * The whole panel renders as a single `<pre>` element with mixed
 * colored `<span>` runs inside. Each "row" is a sequence of spans
 * with explicit `\n` text nodes between rows. There is NO literal
 * whitespace between consecutive lit template expressions in the
 * render method below.
 *
 * This is important because the earlier Stage 7 implementation used
 * a `<div>` per row with `white-space: pre` on each div, which made
 * the literal indentation of the lit template (newlines and spaces
 * between expressions) visible as content. Each row rendered as
 * ~5 lines of mostly-whitespace, blowing the panel up vertically
 * and breaking the column alignment. The single-`<pre>` approach
 * sidesteps this entirely: `<pre>` preserves whitespace by design,
 * but we control ALL of it because the only whitespace inside is
 * what we put in our padded strings.
 *
 * Properties:
 *   - `visible` (boolean) — show/hide
 *   - `protocolName` (string) — e.g. 'ZMODEM-CRC32', 'YMODEM-1K'
 *   - `fileName` (string) — current file being transferred
 *   - `fileNumber` (number, 1-based) — position in batch
 *   - `filesInBatch` (number) — total files
 *   - `snapshot` — latest stats; updated by parent on a render-clock tick
 *   - `statusMessage` (string) — optional bottom-of-panel error/info
 *   - `errorCount` — number of CRC failures observed so far
 *
 * Events:
 *   - `transfer-abort` (CustomEvent<TransferAbortDetail>)
 *   - `transfer-linger-done` (CustomEvent<void>)
 */
@customElement('f-transfer-progress')
export class FTransferProgress extends LitElement {
  @property({ type: Boolean })
  visible = false;

  @property({ type: String, attribute: 'protocol-name' })
  protocolName = 'ZMODEM';

  @property({ type: String, attribute: 'file-name' })
  fileName = '';

  @property({ type: Number, attribute: 'file-number' })
  fileNumber = 1;

  @property({ type: Number, attribute: 'files-in-batch' })
  filesInBatch = 1;

  @property({ attribute: false })
  snapshot: TransferProgressSnapshot | null = null;

  @property({ type: String, attribute: 'status-message' })
  statusMessage = '';

  /**
   * Count of CRC errors observed during this transfer session.
   * Updated by the parent on the render-clock tick. Replaces the
   * old "Efficiency:" placeholder field which was harder to
   * compute and less useful — error count directly tells the
   * user whether the link is clean or flaky.
   *
   * Phase 4 Stage 7 (fixes).
   */
  @property({ type: Number, attribute: false })
  errorCount = 0;

  /** Internal: in post-completion linger phase. */
  @state()
  private _completed = false;

  /**
   * Window-level keydown listener. Two hotkeys trigger abort:
   *
   *   - **ESC** — natural "cancel" gesture for desktop users.
   *   - **CTRL+X** — the canonical "cancel transfer" keystroke for
   *     SEXYZ and most DOS-era terminal programs. CTRL+X is also
   *     literally 0x18 = ASCII CAN = the ZMODEM CAN byte, which is
   *     why the convention exists.
   *
   * IMPORTANT — propagation is INTENTIONALLY allowed to continue.
   * Earlier in the Stage 7 saga I had this calling
   * stopImmediatePropagation() to keep ESC/CTRL-X from being
   * forwarded to the BBS connection. That turned out to be exactly
   * wrong: SEXYZ-on-Synchronet (and likely other senders) actually
   * responds to a literal CTRL-X keystroke in the terminal-input
   * channel — that's the "Press Ctrl-X to abort" prompt SEXYZ
   * displays when starting a transfer.
   *
   * Empirically: in the original fTelnet (no ZMODEM browser-side
   * handling), pressing CTRL-X during a download aborts the
   * transfer; pressing ESC does nothing. The mechanism is that
   * the Crt's keydown handler forwards the keystroke to the BBS
   * as terminal input, where SEXYZ processes 0x18 as cancel.
   *
   * So we now do BOTH paths in parallel:
   *
   *   1. Our state machine sends its protocol-channel abort
   *      (8 CAN + 10 BS via _ZModemReceive.abort()) — this is
   *      "the right thing" per the ZMODEM spec.
   *   2. The keystroke also propagates to Crt's window-level
   *      keydown handler, which forwards \x18 (or \x1b for ESC)
   *      to the BBS as a literal keystroke — this is what
   *      SEXYZ actually responds to in practice.
   *
   * We still preventDefault() so the browser doesn't do anything
   * weird with ESC (some browsers map ESC to "stop loading" etc).
   */
  private _keyHandler = (e: KeyboardEvent): void => {
    if (!this.visible) return;
    const isEscape = e.key === 'Escape' || e.key === 'Esc';
    const isCtrlX = e.ctrlKey && (e.key === 'x' || e.key === 'X');
    if (isEscape || isCtrlX) {
      // preventDefault stops the browser's own ESC handling
      // (e.g. "stop loading"). We do NOT call
      // stopImmediatePropagation or stopPropagation — we WANT
      // Crt's keydown handler to also fire so the keystroke is
      // forwarded to the BBS. See the JSDoc above for why.
      e.preventDefault();
      this.requestAbort();
    }
  };

  public override connectedCallback(): void {
    super.connectedCallback();
    // Attach on BOTH document and window in the capture phase.
    // Capture-phase order across listeners on different ancestors
    // is "outermost first," so a capture listener on `window`
    // fires BEFORE one on `document`. Belt-and-suspenders: if
    // for any reason the window-level capture listener doesn't
    // fire (some browser quirk or framework interference), the
    // document-level one might.
    window.addEventListener('keydown', this._keyHandler, { capture: true });
    document.addEventListener('keydown', this._keyHandler, { capture: true });
  }

  public override disconnectedCallback(): void {
    window.removeEventListener('keydown', this._keyHandler, { capture: true });
    document.removeEventListener('keydown', this._keyHandler, { capture: true });
    super.disconnectedCallback();
  }

  /**
   * Trigger the post-completion linger. Parent calls this after
   * `onSessionComplete`. The panel shows "Complete!" for ~1.5s
   * with the bar pinned at 100%, then dispatches
   * `transfer-linger-done` so the parent can hide the panel.
   */
  public markComplete(): void {
    this._completed = true;
    window.setTimeout(() => {
      this.dispatchEvent(
        new CustomEvent('transfer-linger-done', {
          bubbles: true,
          composed: true,
        }),
      );
    }, 1500);
  }

  /** Reset internal state for a fresh transfer. */
  public reset(): void {
    this._completed = false;
  }

  private requestAbort(): void {
    this.dispatchEvent(
      new CustomEvent<TransferAbortDetail>('transfer-abort', {
        detail: { reason: 'user' },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Render into light DOM. The retro styles are inline (deliberately
   * fixed) so we don't depend on a ftelnet.css class addition.
   */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    if (!this.visible) {
      return html``;
    }

    const snap = this.snapshot;
    const sizeText = snap ? formatBytes(snap.totalBytes) + ' bytes' : '--- bytes';
    const bytesText = snap
      ? formatBytes(snap.bytesReceived) + ' / ' + formatBytes(snap.totalBytes)
      : '0 / 0';
    const timeText = snap ? formatTime(snap.elapsedSeconds) : '--:--:--';
    const etaText = snap ? formatTime(snap.etaSeconds) : '--:--:--';
    const cpsText = snap ? formatCps(snap.cps) : '---';
    const pctText = this._completed
      ? '100%'
      : snap
        ? formatPercent(snap.fraction)
        : '---%';
    const errorsText = String(this.errorCount);

    // CRITICAL: every back-to-back ${...} expression inside the <pre>
    // below must be either directly adjacent (no whitespace between
    // expressions) or separated only by an explicit '\n' character.
    // Lit will faithfully reproduce any whitespace it sees, and inside
    // a <pre> that whitespace is visible. The current formatting puts
    // each line on its own source line for readability, with the
    // separator newline serving double duty as both source layout
    // and rendered output.
    return html`<div
      class="fTelnetTransferProgress"
      style=${this.backdropStyle()}
      @click=${(e: MouseEvent): void => e.stopPropagation()}
    ><pre
      class="fTelnetTransferProgressPanel"
      style=${this.panelStyle()}
      role="dialog"
      aria-label=${this.protocolName + ' file transfer'}
    >${this.lineTopBorder()}
${this.lineTitle()}
${this.lineLabeled('Size:', sizeText)}
${this.lineLabeled('Bytes:', bytesText)}
${this.lineTwoCol('Time:', timeText, 'ETA:', etaText)}
${this.lineTwoCol('CPS:', cpsText, 'Errors:', errorsText)}
${this.lineEmpty()}
${this.lineBar(pctText)}
${this.lineEmpty()}
${this._completed ? this.lineComplete() : this.lineAbortHint()}${
      this.statusMessage
        ? html`
${this.lineStatus()}`
        : ''
    }
${this.lineBottomBorder()}</pre></div>`;
  }

  // ─────────────────────────── styles ───────────────────────────

  /**
   * Backdrop: fullscreen fixed-position dim layer. Covers the
   * viewport behind the panel; click-blocks the BBS canvas. The
   * panel itself is positioned independently (also fixed) so the
   * backdrop doesn't need to flex-center it. This decoupling
   * means a containing-block quirk on the backdrop won't move
   * the panel.
   */
  private backdropStyle(): string {
    return [
      'position: fixed',
      'top: 0',
      'left: 0',
      'right: 0',
      'bottom: 0',
      'background: rgba(0, 0, 0, 0.55)',
      'z-index: 1000',
      'pointer-events: auto',
    ].join('; ');
  }

  /**
   * The retro panel itself — a `<pre>` so whitespace inside our
   * padded strings renders exactly as written. The panel is
   * **directly viewport-centered** via top/left/translate(-50%,-50%)
   * rather than relying on flex centering inside the backdrop. This
   * bulletproofs against ancestor `transform`/`filter`/`contain`
   * shenanigans that could re-anchor a fixed-positioned descendant.
   *
   * We also set every layout property explicitly so the global
   * stylesheet can't perturb it — `margin: 0` (browsers give
   * `<pre>` a default vertical margin), `line-height: 1.2`,
   * `letter-spacing: 0`.
   */
  private panelStyle(): string {
    return [
      'position: fixed',
      'top: 50%',
      'left: 50%',
      'transform: translate(-50%, -50%)',
      'display: block',
      'margin: 0',
      'padding: 6px 8px',
      'background: #0000aa', // retro DOS blue
      'color: #ffffff',
      'font-family: "Courier New", "Lucida Console", "Consolas", monospace',
      'font-size: 14px',
      'line-height: 1.2',
      'letter-spacing: 0',
      'white-space: pre',
      'box-shadow: 0 0 30px rgba(255, 255, 85, 0.4)',
      'border: 0',
      'min-width: auto',
      'max-width: 90vw',
      'overflow: visible',
      'text-align: left',
      'z-index: 1001', // above the backdrop
    ].join('; ');
  }

  // ──────────────────── line composers ────────────────────
  //
  // Each method returns a TemplateResult for ONE line (no trailing
  // newline). The `render()` method joins them with literal '\n'
  // text nodes. Each helper's lit template is on a single line so
  // no inter-expression whitespace leaks into the DOM.

  /** `┌─ <ProtocolName> ──...──┐` (top border, yellow with name embedded). */
  private lineTopBorder(): TemplateResult {
    // Total visible width = PANEL_INNER_WIDTH + 2 (the two border chars).
    // Pattern: `┌─ NAME ` + dashes + `┐`.
    // Fixed chars: `┌─ ` (3), ` ` (1), `┐` (1).
    const total = PANEL_INNER_WIDTH + 2;
    const dashes = Math.max(
      0,
      total - 3 - this.protocolName.length - 1 - 1,
    );
    const dashFill = '─'.repeat(dashes);
    return html`<span style="color: #ffff55">┌─ </span><span style="color: #ffffff">${this.protocolName}</span><span style="color: #ffff55"> ${dashFill}┐</span>`;
  }

  /** `└──...──┘` (bottom border, yellow). */
  private lineBottomBorder(): TemplateResult {
    const dashes = '─'.repeat(PANEL_INNER_WIDTH);
    return html`<span style="color: #ffff55">└${dashes}┘</span>`;
  }

  /** `│  Receiving File N of M: filename  │` (white text). */
  private lineTitle(): TemplateResult {
    const prefix = `Receiving File ${this.fileNumber} of ${this.filesInBatch}: `;
    const maxFileLen = Math.max(8, PANEL_INNER_WIDTH - 2 - prefix.length);
    let name = this.fileName || '???';
    if (name.length > maxFileLen) {
      name = name.slice(0, maxFileLen - 1) + '…';
    }
    const text = '  ' + prefix + name;
    const padded = text.padEnd(PANEL_INNER_WIDTH);
    return html`<span style="color: #55ffff">│</span><span style="color: #ffffff">${padded}</span><span style="color: #55ffff">│</span>`;
  }

  /** `│  Label:        value         │` (cyan label, white value). */
  private lineLabeled(label: string, value: string): TemplateResult {
    const indent = '  ';
    const labelCol = label.padEnd(14);
    const content = indent + labelCol + value;
    const pad = ' '.repeat(Math.max(0, PANEL_INNER_WIDTH - content.length));
    return html`<span style="color: #55ffff">│</span><span style="color: #ffffff">${indent}</span><span style="color: #55ffff">${labelCol}</span><span style="color: #ffffff">${value}${pad}</span><span style="color: #55ffff">│</span>`;
  }

  /** `│  L1:       V1       L2:       V2  │` (two label/value pairs). */
  private lineTwoCol(
    label1: string,
    value1: string,
    label2: string,
    value2: string,
  ): TemplateResult {
    const indent = '  ';
    const label1Col = label1.padEnd(14);
    const value1Col = value1.padEnd(14);
    const label2Col = label2.padEnd(12);
    const content = indent + label1Col + value1Col + label2Col + value2;
    const pad = ' '.repeat(Math.max(0, PANEL_INNER_WIDTH - content.length));
    return html`<span style="color: #55ffff">│</span><span style="color: #ffffff">${indent}</span><span style="color: #55ffff">${label1Col}</span><span style="color: #ffffff">${value1Col}</span><span style="color: #55ffff">${label2Col}</span><span style="color: #ffffff">${value2}${pad}</span><span style="color: #55ffff">│</span>`;
  }

  /** `│                              │` (empty row inside borders). */
  private lineEmpty(): TemplateResult {
    return html`<span style="color: #55ffff">│</span><span>${' '.repeat(PANEL_INNER_WIDTH)}</span><span style="color: #55ffff">│</span>`;
  }

  /** `│  [█████░░░░░░░] 38%          │` (progress bar + percentage). */
  private lineBar(pctText: string): TemplateResult {
    const snap = this.snapshot;
    const fillable = BAR_WIDTH - 2; // exclude `[` and `]`
    let fillN: number;
    if (this._completed) {
      fillN = fillable;
    } else if (snap === null || snap.fraction === null) {
      fillN = 0;
    } else {
      fillN = Math.round(
        Math.max(0, Math.min(1, snap.fraction)) * fillable,
      );
    }
    const filled = '█'.repeat(fillN);
    const empty = '░'.repeat(fillable - fillN);
    const indent = '  ';
    // Compute padding to fill the line to PANEL_INNER_WIDTH:
    //   indent (2) + '[' (1) + fillable + ']' (1) + ' ' (1) + pctText + pad
    const beforePct = indent.length + 1 + fillable + 1 + 1;
    const pad = ' '.repeat(
      Math.max(0, PANEL_INNER_WIDTH - beforePct - pctText.length),
    );
    return html`<span style="color: #55ffff">│</span><span style="color: #ffffff">${indent}[</span><span style="color: #55ff55">${filled}</span><span style="color: #5555aa">${empty}</span><span style="color: #ffffff">] ${pctText}${pad}</span><span style="color: #55ffff">│</span>`;
  }

  /** `│  [ Press ESC/CTRL-X or click to abort ]      │` (clickable). */
  private lineAbortHint(): TemplateResult {
    const text = '  [ Press ESC/CTRL-X or click here ]';
    const padded = text.padEnd(PANEL_INNER_WIDTH);
    return html`<span style="color: #55ffff">│</span><span style="color: #ffff55; cursor: pointer; text-decoration: underline;" role="button" tabindex="0" @click=${(e: MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      this.requestAbort();
    }} @keydown=${(e: KeyboardEvent): void => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.requestAbort();
      }
    }}>${padded}</span><span style="color: #55ffff">│</span>`;
  }

  /** `│  Complete!                       │` (green, post-success). */
  private lineComplete(): TemplateResult {
    const text = '  Complete!';
    const padded = text.padEnd(PANEL_INNER_WIDTH);
    return html`<span style="color: #55ffff">│</span><span style="color: #55ff55">${padded}</span><span style="color: #55ffff">│</span>`;
  }

  /** `│  <statusMessage>                 │` (yellow, error/info text). */
  private lineStatus(): TemplateResult {
    let msg = this.statusMessage;
    if (msg.length > PANEL_INNER_WIDTH - 2) {
      msg = msg.slice(0, PANEL_INNER_WIDTH - 3) + '…';
    }
    const padded = ('  ' + msg).padEnd(PANEL_INNER_WIDTH);
    return html`<span style="color: #55ffff">│</span><span style="color: #ffff55">${padded}</span><span style="color: #55ffff">│</span>`;
  }
}
