/*
 * fTelnet-Modern — upload confirmation dialog component
 *
 * Copyright (C) 2026 Tom Swartz <dangerbaybbs@hotmail.com>
 * Copyright (C) 2009-2026 R&M Software (Rick Parrish, original fTelnet)
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { html, LitElement, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/** Payload for the `upload-confirm` event. */
export interface UploadConfirmDetail {
  file: File;
}

/** Payload for the `upload-cancel` event (no payload — just a signal). */
export type UploadCancelDetail = Record<string, never>;

/**
 * `<f-upload-confirm>` — modal confirmation dialog shown after the
 * user drops a file or picks one from the file picker, before any
 * bytes go to the wire.
 *
 * Phase 5 polish; part of the upload UI sub-project (Delta 1).
 *
 * Shows:
 *   - File name (read-only — rename-on-upload deferred)
 *   - File size, human-friendly
 *   - Last-modified date
 *   - "Send via ZMODEM" label (single-option, no picker until we
 *     have a second send protocol — Q3 design decision)
 *   - Send / Cancel buttons
 *   - Reminder warning: "Make sure your BBS is at an upload prompt"
 *     (Q6 design decision — we don't try to detect; user is
 *     responsible).
 *
 * Behavior:
 *   - Viewport-centered modal overlay, same positioning model as
 *     FSettingsPanel (top/left 50% + translate -50%).
 *   - Click outside the dialog → cancel (same UX as Settings).
 *   - ESC key → cancel.
 *   - Enter key while dialog focused → confirm (Send).
 *   - Send dispatches `upload-confirm`; Cancel dispatches
 *     `upload-cancel`. Parent decides what happens next.
 */
@customElement('f-upload-confirm')
export class FUploadConfirm extends LitElement {
  /** Whether the dialog is open. Parent toggles this on file select. */
  @property({ type: Boolean })
  open = false;

  /**
   * The file under consideration. Null when no file is queued. The
   * dialog renders file name/size/mtime from this object.
   */
  @property({ attribute: false })
  file: File | null = null;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /**
   * Click-outside-to-close pattern (same as FMenuPopup/FSettingsPanel).
   * Deferred via microtask so the click that opens the dialog
   * doesn't immediately close it.
   */
  private _outsideClickHandler = (e: MouseEvent): void => {
    if (!this.open) return;
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
   */
  private _keyHandler = (e: KeyboardEvent): void => {
    if (!this.open) return;
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

  public override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    if (changed.has('open')) {
      if (this.open) {
        queueMicrotask(() => {
          document.addEventListener(
            'mousedown',
            this._outsideClickHandler,
            true,
          );
          document.addEventListener('keydown', this._keyHandler, true);
        });
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
    if (this.file === null) return;
    this.dispatchEvent(
      new CustomEvent<UploadConfirmDetail>('upload-confirm', {
        detail: { file: this.file },
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

  protected override render(): TemplateResult {
    if (!this.open || this.file === null) {
      return html``;
    }
    const f = this.file;
    return html`
      <div class="fTelnetUploadConfirm">
        <div class="fTelnetUploadConfirmHeader">Confirm Upload</div>
        <div class="fTelnetUploadConfirmBody">
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
            >Send</a
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
