/*
 * fTelnet-Modern — upload confirmation dialog component
 *
 * Copyright (C) 2026 Tom Swartz <dangerbaybbs@hotmail.com>
 * Copyright (C) 2009-2026 R&M Software (Rick Parrish, original fTelnet)
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { html, LitElement, type TemplateResult, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

/**
 * Payload for the `upload-confirm` event.
 *
 * `files` carries every file the user chose to send. ZMODEM
 * handles them sequentially as a single batch (one session,
 * ZFILE → ZDATA → ZEOF → ZRINIT → next ZFILE → ...). Cancelling
 * mid-batch via the abort UI cancels the whole batch.
 *
 * Single-file confirms are still common; the array just has
 * length 1. There's no separate single-file event shape.
 */
export interface UploadConfirmDetail {
  files: File[];
}

/** Payload for the `upload-cancel` event (no payload — just a signal). */
export type UploadCancelDetail = Record<string, never>;

/**
 * `<f-upload-confirm>` — modal confirmation dialog shown after the
 * user drops one or more files or picks them from the file picker,
 * before any bytes go to the wire.
 *
 * Phase 5 polish; part of the upload UI sub-project (Delta 1,
 * extended for multi-file in Delta 3).
 *
 * Single-file mode (most common): shows the original layout —
 * file name, size, last-modified, protocol, send/cancel.
 *
 * Multi-file mode (2+ files): shows a summary line
 * ("3 files — 1.2 MB total") with a "▾ details" toggle that
 * expands a scrollable list of file rows. This stays compact for
 * the common case while gracefully handling large batches (50+
 * files won't blow out the dialog).
 *
 * Behavior:
 *   - Viewport-centered modal overlay, same positioning model as
 *     FSettingsPanel (top/left 50% + translate -50%).
 *   - Click outside the dialog → cancel (same UX as Settings).
 *   - ESC key → cancel.
 *   - Enter key while dialog focused → confirm (Send).
 *   - Send dispatches `upload-confirm` with all files; Cancel
 *     dispatches `upload-cancel`. Parent decides what happens next.
 */
@customElement('f-upload-confirm')
export class FUploadConfirm extends LitElement {
  /** Whether the dialog is open. Parent toggles this on file select. */
  @property({ type: Boolean })
  open = false;

  /**
   * The files under consideration. Empty array when nothing is
   * queued. The dialog renders name/size/mtime per file; for 2+
   * files the list is collapsed behind a details toggle.
   *
   * Stored as a plain `File[]` rather than `FileList` so it's
   * easy to construct in tests and mutate during the dialog's
   * lifetime (future: per-row remove buttons).
   */
  @property({ attribute: false })
  files: File[] = [];

  /**
   * Whether the multi-file details list is expanded. Only used
   * when `files.length > 1`. Reset to false every time the dialog
   * opens, so each new batch starts collapsed.
   */
  @state()
  private _detailsOpen = false;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /**
   * Click-outside-to-close pattern. Same idea as FMenuPopup /
   * FSettingsPanel, but with a refinement: instead of deferring
   * listener attachment via `queueMicrotask` (which can race with
   * the next render cycle when the dialog is opened/closed in
   * rapid succession), we attach synchronously and use a
   * timestamp guard. Any outside-click within
   * OPEN_GUARD_MS of opening is ignored.
   *
   * This avoids a class of bugs where rapid open/close cycles
   * (e.g. drag-and-drop the same file twice in a row) could
   * land the dialog in a state where the click handler bindings
   * went stale.
   */
  private static readonly OPEN_GUARD_MS = 50;
  private _openedAt = 0;

  private _outsideClickHandler = (e: MouseEvent): void => {
    if (!this.open) return;
    if (performance.now() - this._openedAt < FUploadConfirm.OPEN_GUARD_MS) {
      return;
    }
    const target = e.target as Node;
    if (!this.contains(target)) {
      this._cancel();
    }
  };

  /**
   * ESC key cancels, Enter confirms. Capture-phase listener on
   * document so we get the key before the BBS canvas does (the
   * canvas otherwise forwards ESC/Enter to the BBS, which we
   * don't want during upload confirmation).
   *
   * Same OPEN_GUARD_MS protection as the outside-click handler —
   * a stray Enter that fires immediately on open shouldn't
   * auto-confirm.
   */
  private _keyHandler = (e: KeyboardEvent): void => {
    if (!this.open) return;
    if (performance.now() - this._openedAt < FUploadConfirm.OPEN_GUARD_MS) {
      return;
    }
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      this._cancel();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this._confirm();
    }
  };

  public override willUpdate(changed: Map<string, unknown>): void {
    super.willUpdate(changed);
    // Reset _detailsOpen BEFORE render runs, not after. If we did
    // this in updated() (which runs after render), the very next
    // render after open=true would still see the stale expanded
    // state, then collapse on the cycle after. willUpdate fixes
    // that race.
    if (changed.has('open') && this.open) {
      this._detailsOpen = false;
    }
  }

  public override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    if (changed.has('open')) {
      if (this.open) {
        this._openedAt = performance.now();
        document.addEventListener(
          'mousedown',
          this._outsideClickHandler,
          true,
        );
        document.addEventListener('keydown', this._keyHandler, true);
      } else {
        document.removeEventListener(
          'mousedown',
          this._outsideClickHandler,
          true,
        );
        document.removeEventListener('keydown', this._keyHandler, true);
      }
    }
  }

  public override disconnectedCallback(): void {
    document.removeEventListener(
      'mousedown',
      this._outsideClickHandler,
      true,
    );
    document.removeEventListener('keydown', this._keyHandler, true);
    super.disconnectedCallback();
  }

  private _confirm(): void {
    if (this.files.length === 0) return;
    this.dispatchEvent(
      new CustomEvent<UploadConfirmDetail>('upload-confirm', {
        detail: { files: this.files },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _cancel(): void {
    this.dispatchEvent(
      new CustomEvent<UploadCancelDetail>('upload-cancel', {
        detail: {},
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Format a byte count as a human-friendly string.
   * 0..1023 → "N bytes"
   * 1024..1048575 → "N.M KB"
   * else → "N.M MB"
   */
  private _formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} bytes`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  /** Format a Date as a short locale string. */
  private _formatDate(ms: number): string {
    if (ms === 0) return 'Unknown';
    const d = new Date(ms);
    return d.toLocaleString();
  }

  /** Sum sizes across the batch. */
  private _totalSize(): number {
    let total = 0;
    for (const f of this.files) total += f.size;
    return total;
  }

  /** Render the dialog body — switches on single vs. multi-file. */
  private _renderBody(): TemplateResult {
    if (this.files.length === 1) {
      return this._renderSingleFileBody(this.files[0]!);
    }
    return this._renderMultiFileBody();
  }

  /**
   * Single-file mode: original layout, unchanged from Delta 1.
   * Most uploads are single files; keeping this familiar matters
   * more than code symmetry.
   */
  private _renderSingleFileBody(f: File): TemplateResult {
    return html`
      <div class="fTelnetUploadConfirmRow">
        <span class="fTelnetUploadConfirmLabel">File:</span>
        <span class="fTelnetUploadConfirmValue">${f.name}</span>
      </div>
      <div class="fTelnetUploadConfirmRow">
        <span class="fTelnetUploadConfirmLabel">Size:</span>
        <span class="fTelnetUploadConfirmValue"
          >${this._formatSize(f.size)}</span
        >
      </div>
      <div class="fTelnetUploadConfirmRow">
        <span class="fTelnetUploadConfirmLabel">Modified:</span>
        <span class="fTelnetUploadConfirmValue"
          >${this._formatDate(f.lastModified)}</span
        >
      </div>
      <div class="fTelnetUploadConfirmRow">
        <span class="fTelnetUploadConfirmLabel">Protocol:</span>
        <span class="fTelnetUploadConfirmValue">ZMODEM</span>
      </div>
    `;
  }

  /**
   * Multi-file mode: summary line + collapsible details list.
   *
   * Summary stays small (one line of "N files — total size") so a
   * 50-file batch confirms in the same compact dialog as a
   * 2-file batch. Clicking "▾ details" expands a scrollable list
   * with per-file rows. Scrollable, capped at 12em max-height so
   * the dialog never grows past a reasonable size regardless of
   * batch count.
   */
  private _renderMultiFileBody(): TemplateResult {
    const total = this._totalSize();
    return html`
      <div class="fTelnetUploadConfirmRow">
        <span class="fTelnetUploadConfirmLabel">Files:</span>
        <span class="fTelnetUploadConfirmValue"
          >${this.files.length} files</span
        >
      </div>
      <div class="fTelnetUploadConfirmRow">
        <span class="fTelnetUploadConfirmLabel">Total size:</span>
        <span class="fTelnetUploadConfirmValue"
          >${this._formatSize(total)}</span
        >
      </div>
      <div class="fTelnetUploadConfirmRow">
        <span class="fTelnetUploadConfirmLabel">Protocol:</span>
        <span class="fTelnetUploadConfirmValue">ZMODEM (batch)</span>
      </div>
      <div class="fTelnetUploadConfirmRow">
        <a
          href="#"
          class="fTelnetUploadConfirmDetailsToggle"
          aria-expanded=${this._detailsOpen ? 'true' : 'false'}
          @click=${(e: MouseEvent): void => {
            e.preventDefault();
            this._detailsOpen = !this._detailsOpen;
          }}
          >${this._detailsOpen ? '▾ Hide details' : '▸ Show details'}</a
        >
      </div>
      ${this._detailsOpen ? this._renderFileList() : nothing}
    `;
  }

  /** The scrollable per-file list (only rendered when expanded). */
  private _renderFileList(): TemplateResult {
    return html`
      <div class="fTelnetUploadConfirmFileList">
        ${this.files.map(
          (f, i) => html`
            <div class="fTelnetUploadConfirmFileRow">
              <span class="fTelnetUploadConfirmFileIndex">${i + 1}.</span>
              <span class="fTelnetUploadConfirmFileName">${f.name}</span>
              <span class="fTelnetUploadConfirmFileSize"
                >${this._formatSize(f.size)}</span
              >
            </div>
          `,
        )}
      </div>
    `;
  }

  protected override render(): TemplateResult {
    if (!this.open || this.files.length === 0) {
      return html``;
    }
    const isBatch = this.files.length > 1;
    return html`
      <div class="fTelnetUploadConfirm">
        <div class="fTelnetUploadConfirmHeader">
          ${isBatch ? 'Confirm Upload (Batch)' : 'Confirm Upload'}
        </div>
        <div class="fTelnetUploadConfirmBody">
          ${this._renderBody()}
          <div class="fTelnetUploadConfirmWarning">
            ⚠️ Make sure your BBS is at an upload prompt before
            clicking Send.
          </div>
        </div>
        <div class="fTelnetUploadConfirmFooter">
          <a
            href="#"
            class="fTelnetUploadConfirmCancel"
            @click=${(e: MouseEvent): void => {
              e.preventDefault();
              this._cancel();
            }}
            >Cancel</a
          >
          <a
            href="#"
            class="fTelnetUploadConfirmSend"
            @click=${(e: MouseEvent): void => {
              e.preventDefault();
              this._confirm();
            }}
            >${isBatch ? `Send ${this.files.length} files` : 'Send'}</a
          >
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'f-upload-confirm': FUploadConfirm;
  }
}
