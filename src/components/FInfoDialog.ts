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
import { customElement, property } from 'lit/decorators.js';
import { t, type Language } from '@i18n/index.js';

/**
 * Payload for the `info-dialog-close` event — fires when the user
 * dismisses the dialog (OK button, Escape, Enter, or click-outside).
 */
export interface InfoDialogCloseDetail {
  /* Empty — the event itself is the signal. */
}

/**
 * <f-info-dialog> — a themed modal replacement for the browser's
 * built-in alert() for INFORMATIONAL messages. Phase 5 (beta.4).
 *
 * Why this exists: raw alert() can't be themed, can't have a title
 * bar, and renders in tiny browser-default text with the page's
 * origin shown as a "title" (e.g. "localhost:5173"). This component
 * gives informational dialogs the same look as the rest of the
 * fTelnet chrome — themed background, a real title bar, and larger,
 * readable body text.
 *
 * Scope: this is for INFORMATIONAL messages the user encounters in
 * normal operation (e.g. "here's how downloads work"). It is NOT a
 * confirm/cancel dialog — there's a single OK button that just
 * dismisses. For yes/no decisions, use a confirm-style component
 * like FUploadConfirm instead.
 *
 * Content model: the title and message are plain strings set as
 * properties. The message supports simple paragraph breaks — split
 * on '\n\n' into separate <p> elements — so multi-paragraph alert
 * text (which used '\n\n' separators) carries over cleanly.
 *
 * Light DOM is used so the existing ftelnet.css styles apply
 * uniformly — matching FSettingsPanel, FUploadConfirm, FUserManual.
 *
 * Dismissal: OK button, Escape key, Enter key, or click-outside.
 * All four dispatch `info-dialog-close` (bubbles + composed). The
 * host typically just sets `open = false` in response.
 */
@customElement('f-info-dialog')
export class FInfoDialog extends LitElement {
  /**
   * Whether the dialog is visible. When false, renders nothing
   * meaningful (display:none on the root).
   */
  @property({ type: Boolean })
  open = false;

  /**
   * Title bar text. Keep it short — a few words.
   */
  @property({ type: String })
  dialogTitle = '';

  /**
   * Body message. Supports '\n\n' paragraph separators — each
   * becomes its own <p>. Single '\n' within a paragraph is
   * rendered as a line break.
   */
  @property({ type: String })
  message = '';

  /** Active UI language; drives the OK button label via t(). */
  @property({ type: String })
  language: Language = 'en';

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /**
   * Open-guard window: any Escape/Enter/outside-click within this
   * many ms of opening is ignored, so a keypress or click that
   * triggered the dialog can't immediately dismiss it. Same
   * pattern as FUploadConfirm.
   */
  private static readonly OPEN_GUARD_MS = 50;
  private _openedAt = 0;

  private _outsideClickHandler = (e: MouseEvent): void => {
    if (!this.open) return;
    if (performance.now() - this._openedAt < FInfoDialog.OPEN_GUARD_MS) {
      return;
    }
    const target = e.target as Node;
    if (!this.contains(target)) {
      this._close();
    }
  };

  private _keyHandler = (e: KeyboardEvent): void => {
    if (!this.open) return;
    if (performance.now() - this._openedAt < FInfoDialog.OPEN_GUARD_MS) {
      return;
    }
    // Both Escape and Enter dismiss — this is an acknowledge-only
    // dialog, so either "I'm done" key closes it. Capture phase so
    // we beat the BBS canvas's own key handling.
    if (
      e.key === 'Escape' ||
      e.key === 'Esc' ||
      e.key === 'Enter'
    ) {
      e.preventDefault();
      e.stopPropagation();
      this._close();
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
    // Defensive: make sure we never leak document-level listeners
    // if the element is removed while open.
    document.removeEventListener(
      'mousedown',
      this._outsideClickHandler,
      true,
    );
    document.removeEventListener('keydown', this._keyHandler, true);
  }

  private _close(): void {
    this.dispatchEvent(
      new CustomEvent<InfoDialogCloseDetail>('info-dialog-close', {
        detail: {},
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleOkClick = (e: Event): void => {
    e.preventDefault();
    this._close();
  };

  /**
   * Split the message into paragraphs on '\n\n', and within each
   * paragraph turn single '\n' into <br>. Returns an array of
   * TemplateResults, one <p> per paragraph.
   */
  private renderMessageParagraphs(): TemplateResult[] {
    const paragraphs = this.message.split('\n\n');
    return paragraphs.map((para) => {
      const lines = para.split('\n');
      // Interleave text lines with <br> between them.
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
            ${t('dialog.button.ok', this.language)}
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'f-info-dialog': FInfoDialog;
  }
}
