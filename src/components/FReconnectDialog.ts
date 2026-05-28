/*
 * fTelnet-Modern — auto-reconnect countdown dialog component
 *
 * Copyright (C) 2026 Tom Swartz
 * Copyright (C) 2009-2026 R&M Software (Rick Parrish, original fTelnet)
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { LitElement, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { t, tf, type Language } from '@i18n/index.js';

/**
 * Fired when the countdown reaches zero (the client should
 * reconnect) OR when the user clicks Cancel (the client should stay
 * disconnected). `reconnect` is true on expiry, false on cancel.
 */
export interface ReconnectDialogResultDetail {
  reconnect: boolean;
}

/**
 * `<f-reconnect-dialog>` — a themed countdown modal shown after an
 * UNEXPECTED disconnect (never after a user-initiated one). It tells
 * the user the connection was lost, counts down from `seconds`, and
 * offers a single Cancel button. Phase 5 (beta.41).
 *
 * Behavior:
 *   - When `open` flips true, the dialog seeds its countdown from the
 *     `seconds` property and ticks once per second.
 *   - On reaching 0, it stops and fires `reconnect-dialog-result`
 *     with reconnect=true (the client reconnects).
 *   - Clicking Cancel (or Escape) fires reconnect-dialog-result with
 *     reconnect=false (the client stays disconnected). There is NO
 *     OK button — reconnection is the do-nothing default, so a second
 *     affirmative button would be redundant.
 *   - Clicking outside does NOTHING here (unlike FConfirmDialog):
 *     an accidental misclick shouldn't silently cancel an automatic
 *     reconnect. Only the explicit Cancel button / Escape cancels.
 *
 * Like FConfirmDialog, this REUSES FInfoDialog's CSS classes so it
 * inherits the themed chrome with no new styling. The only structural
 * difference is the single Cancel button and the live countdown text.
 *
 * The component owns its timer and cleans it up on close / removal,
 * so the parent only has to toggle `open` and listen for the result.
 */
@customElement('f-reconnect-dialog')
export class FReconnectDialog extends LitElement {
  /** Whether the dialog is open. Parent toggles this. */
  @property({ type: Boolean })
  open = false;

  /** Total seconds to count down from when opened. */
  @property({ type: Number })
  seconds = 5;

  /** Which reconnect attempt this is (1-based), shown in the popup. */
  @property({ type: Number })
  attempt = 1;

  /** Total allowed attempts, shown as "Attempts: n of N". */
  @property({ type: Number })
  maxAttempts = 3;

  /** Active UI language; drives the title, body, and Cancel label. */
  @property({ type: String })
  language: Language = 'en';

  /** Live remaining-seconds value, re-rendered each tick. */
  @state()
  private _remaining = 5;

  private _timer: ReturnType<typeof setInterval> | undefined;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /**
   * Open-guard window: ignore an Escape within this many ms of
   * opening, so the keypress that may have accompanied the drop
   * can't instantly cancel the reconnect. Mirrors the other dialogs.
   */
  private static readonly OPEN_GUARD_MS = 50;
  private _openedAt = 0;

  private _keyHandler = (e: KeyboardEvent): void => {
    if (!this.open) return;
    if (performance.now() - this._openedAt < FReconnectDialog.OPEN_GUARD_MS) {
      return;
    }
    // Escape cancels the reconnect (same as clicking Cancel). Enter
    // is intentionally NOT bound: there's no affirmative button, and
    // doing nothing already reconnects, so Enter would be ambiguous.
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      this._resolve(false);
    }
  };

  public override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    if (changed.has('open')) {
      if (this.open) {
        this._openedAt = performance.now();
        this._remaining = this.seconds;
        this._startTimer();
        document.addEventListener('keydown', this._keyHandler, true);
      } else {
        this._stopTimer();
        document.removeEventListener('keydown', this._keyHandler, true);
      }
    }
  }

  public override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopTimer();
    document.removeEventListener('keydown', this._keyHandler, true);
  }

  private _startTimer(): void {
    this._stopTimer();
    this._timer = setInterval((): void => {
      this._remaining -= 1;
      if (this._remaining <= 0) {
        // Reached zero — reconnect.
        this._resolve(true);
      }
    }, 1000);
  }

  private _stopTimer(): void {
    if (this._timer !== undefined) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  /**
   * Stop the timer and notify the parent. We stop first so a result
   * can't fire twice (e.g. Cancel landing on the same tick as expiry).
   */
  private _resolve(reconnect: boolean): void {
    this._stopTimer();
    this.dispatchEvent(
      new CustomEvent<ReconnectDialogResultDetail>('reconnect-dialog-result', {
        detail: { reconnect },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleCancelClick = (e: Event): void => {
    e.preventDefault();
    this._resolve(false);
  };

  protected override render(): TemplateResult {
    const body = tf('reconnect.body', this.language, {
      seconds: String(Math.max(this._remaining, 0)),
    });
    const attempts = tf('reconnect.attempts', this.language, {
      n: String(this.attempt),
      max: String(this.maxAttempts),
    });
    return html`
      <div
        class="fTelnetInfoDialog"
        style=${this.open ? '' : 'display:none'}
        role="dialog"
        aria-modal="true"
      >
        <div class="fTelnetInfoDialogHeader">
          ${t('reconnect.title', this.language)}
        </div>
        <div class="fTelnetInfoDialogBody">
          <p class="fTelnetInfoDialogParagraph">${body}</p>
          <p class="fTelnetInfoDialogParagraph">${attempts}</p>
        </div>
        <div class="fTelnetInfoDialogFooter">
          <button
            type="button"
            class="fTelnetInfoDialogOk fTelnetConfirmDialogCancel"
            @click=${this.handleCancelClick}
          >
            ${t('reconnect.cancel', this.language)}
          </button>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'f-reconnect-dialog': FReconnectDialog;
  }
}
