/*
 * fTelnet-Modern — confirmation (yes/no) dialog component
 *
 * Copyright (C) 2026 Tom Swartz
 * Copyright (C) 2009-2026 R&M Software (Rick Parrish, original fTelnet)
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { LitElement, html, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { t, type Language } from '@i18n/index.js';

/**
 * Payload for the `confirm-dialog-result` event. `confirmed` is true
 * if the user clicked OK / pressed Enter, false if they clicked
 * Cancel / pressed Escape / clicked outside.
 */
export interface ConfirmDialogResultDetail {
  confirmed: boolean;
}

/**
 * `<f-confirm-dialog>` — a themed yes/no modal, the confirm-style
 * companion to <f-info-dialog>. Phase 5 (beta.22).
 *
 * Why this exists: the browser's built-in `confirm()` (used by, e.g.,
 * the disconnect prompt) can't be themed and has no title bar — it
 * renders as raw OS/browser chrome that clashes with the rest of the
 * fTelnet UI. FInfoDialog already solved this for informational
 * `alert()`-style messages, but it's acknowledge-only (single OK
 * button); its own docs point yes/no decisions here.
 *
 * This component deliberately REUSES FInfoDialog's CSS classes
 * (`fTelnetInfoDialog`, `...Header`, `...Body`, `...Footer`,
 * `...Paragraph`, and `...Ok` for the buttons) so it inherits the
 * exact same themed background, title bar, and per-theme overrides
 * already defined in ftelnet.css — no new styling needed. The only
 * structural addition is a second (Cancel) button in the footer.
 *
 * Content model: `dialogTitle` and `message` are plain strings, same
 * as FInfoDialog. The message supports '\n\n' paragraph breaks.
 *
 * Result: OK/Enter → `confirm-dialog-result` with confirmed=true.
 * Cancel/Escape/click-outside → confirmed=false. The event bubbles +
 * composed; the parent decides what to do. (See
 * fTelnetClient.showConfirmDialog, which wraps this in a Promise.)
 */
@customElement('f-confirm-dialog')
export class FConfirmDialog extends LitElement {
  /** Whether the dialog is open. Parent toggles this. */
  @property({ type: Boolean })
  open = false;

  /** Title bar text. Keep it short — a few words. */
  @property({ type: String })
  dialogTitle = '';

  /** Body message. Supports '\n\n' paragraph separators. */
  @property({ type: String })
  message = '';

  /**
   * Label for the confirm button. When empty (the default), the
   * button uses the translated `dialog.button.ok` for the active
   * `language`. A non-empty value overrides the translation.
   */
  @property({ type: String })
  okLabel = '';

  /**
   * Label for the cancel button. When empty (the default), the
   * button uses the translated `dialog.button.cancel`.
   */
  @property({ type: String })
  cancelLabel = '';

  /** Active UI language; drives the default OK/Cancel labels. */
  @property({ type: String })
  language: Language = 'en';

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /**
   * Open-guard window: any Escape/Enter/outside-click within this
   * many ms of opening is ignored, so the click/keypress that
   * triggered the dialog can't immediately dismiss it. Same pattern
   * as FInfoDialog / FUploadConfirm.
   */
  private static readonly OPEN_GUARD_MS = 50;
  private _openedAt = 0;

  private _outsideClickHandler = (e: MouseEvent): void => {
    if (!this.open) return;
    if (performance.now() - this._openedAt < FConfirmDialog.OPEN_GUARD_MS) {
      return;
    }
    const target = e.target as Node;
    if (!this.contains(target)) {
      // Click outside cancels (the safe default for a yes/no prompt).
      this._resolve(false);
    }
  };

  private _keyHandler = (e: KeyboardEvent): void => {
    if (!this.open) return;
    if (performance.now() - this._openedAt < FConfirmDialog.OPEN_GUARD_MS) {
      return;
    }
    // Capture phase so we beat the BBS canvas's own key handling.
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      this._resolve(false);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      this._resolve(true);
    }
  };

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
    super.disconnectedCallback();
    // Defensive: never leak document-level listeners if removed while open.
    document.removeEventListener(
      'mousedown',
      this._outsideClickHandler,
      true,
    );
    document.removeEventListener('keydown', this._keyHandler, true);
  }

  private _resolve(confirmed: boolean): void {
    this.dispatchEvent(
      new CustomEvent<ConfirmDialogResultDetail>('confirm-dialog-result', {
        detail: { confirmed },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleOkClick = (e: Event): void => {
    e.preventDefault();
    this._resolve(true);
  };

  private handleCancelClick = (e: Event): void => {
    e.preventDefault();
    this._resolve(false);
  };

  /**
   * Split the message into paragraphs on '\n\n', and within each
   * paragraph turn single '\n' into <br>. Mirrors FInfoDialog.
   */
  private renderMessageParagraphs(): TemplateResult[] {
    const paragraphs = this.message.split('\n\n');
    return paragraphs.map((para) => {
      const lines = para.split('\n');
      const parts: (TemplateResult | string)[] = [];
      lines.forEach((line, i) => {
        if (i > 0) parts.push(html`<br />`);
        parts.push(line);
      });
      return html`<p class="fTelnetInfoDialogParagraph">${parts}</p>`;
    });
  }

  protected override render(): TemplateResult {
    return html`
      <div
        class="fTelnetInfoDialog"
        style=${this.open ? '' : 'display:none'}
        role="dialog"
        aria-modal="true"
      >
        <div class="fTelnetInfoDialogHeader">${this.dialogTitle}</div>
        <div class="fTelnetInfoDialogBody">
          ${this.renderMessageParagraphs()}
        </div>
        <div class="fTelnetInfoDialogFooter">
          <button
            type="button"
            class="fTelnetInfoDialogOk"
            @click=${this.handleOkClick}
          >
            ${this.okLabel || t('dialog.button.ok', this.language)}
          </button>
          <button
            type="button"
            class="fTelnetInfoDialogOk fTelnetConfirmDialogCancel"
            @click=${this.handleCancelClick}
          >
            ${this.cancelLabel || t('dialog.button.cancel', this.language)}
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'f-confirm-dialog': FConfirmDialog;
  }
}
