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
 * `<f-scrollback-bar>` — the green bar shown above the BBS canvas
 * when the user is viewing the scrollback buffer.
 *
 * Properties:
 *   - `mode` ('classic' | 'modern', default 'classic') — selects
 *     between the two render variants.
 *     - **classic**: span + five `<a>` links (Line Up / Line Down
 *       / Page Up / Page Down / Exit). Dispatched events let the
 *       parent push synthetic key events onto the Crt's queue.
 *     - **modern**: a single message line telling the user to
 *       scroll to exit. Used when the modern scrollback path is
 *       enabled — there the actual scrolling is done by the
 *       browser's native overflow, so we just show a hint.
 *   - `visible` (boolean, default false) — controls display.
 *   - `widthPx` (number, default 0) — explicit width; 0 = inherit.
 *
 * Events (classic mode only):
 *   - `scrollback-line-up`     — Line Up clicked
 *   - `scrollback-line-down`   — Line Down clicked
 *   - `scrollback-page-up`     — Page Up clicked
 *   - `scrollback-page-down`   — Page Down clicked
 *   - `scrollback-exit`        — Exit clicked
 *
 * All events `bubbles: true, composed: true` per the component
 * conventions. They carry no payload — the action is in the
 * name.
 *
 * CSS: inherits styles from `.fTelnetScrollback` and
 * `.fTelnetScrollback a` in ftelnet.css. Light DOM so those
 * selectors continue to apply.
 *
 * Replaces ~65 lines of imperative DOM construction in the
 * original `fTelnetClient.ts` constructor. The classic-vs-modern
 * branch in the constructor is now a `mode` property — the
 * choice still lives in fTelnetClient (it depends on RIP mode
 * and DetectMobileBrowser.SupportsModernScrollback), but the
 * rendering lives here.
 */
@customElement('f-scrollback-bar')
export class FScrollbackBar extends LitElement {
  @property({ type: String })
  mode: 'classic' | 'modern' = 'classic';

  @property({ type: Boolean })
  visible = false;

  @property({ type: Number, attribute: 'width-px' })
  widthPx = 0;

  /** Active UI language; drives the bar labels via t(). */
  @property({ type: String })
  language: Language = 'en';

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const inlineStyle: string = this.buildInlineStyle();

    return this.mode === 'modern'
      ? html`
          <div class="fTelnetScrollback" style=${inlineStyle}>
            ${t('scrollback.modern.hint', this.language)}
          </div>
        `
      : html`
          <div class="fTelnetScrollback" style=${inlineStyle}>
            <span>${t('scrollback.label', this.language)}</span>
            <a
              href="#"
              @click=${(e: MouseEvent): void => this.handleClick(e, 'scrollback-line-up')}
              >${t('scrollback.lineUp', this.language)}</a
            >
            <a
              href="#"
              @click=${(e: MouseEvent): void => this.handleClick(e, 'scrollback-line-down')}
              >${t('scrollback.lineDown', this.language)}</a
            >
            <a
              href="#"
              @click=${(e: MouseEvent): void => this.handleClick(e, 'scrollback-page-up')}
              >${t('scrollback.pageUp', this.language)}</a
            >
            <a
              href="#"
              @click=${(e: MouseEvent): void => this.handleClick(e, 'scrollback-page-down')}
              >${t('scrollback.pageDown', this.language)}</a
            >
            <a
              href="#"
              @click=${(e: MouseEvent): void => this.handleClick(e, 'scrollback-exit')}
              >${t('scrollback.exit', this.language)}</a
            >
          </div>
        `;
  }

  /**
   * Combine width + visibility into a single inline `style`
   * attribute. Returns an empty string when no inline style is
   * needed.
   *
   * Mirrors the same pattern in FFocusWarning so subsequent
   * components can copy-paste a known-good approach.
   */
  private buildInlineStyle(): string {
    const parts: string[] = [];
    if (this.widthPx > 0) {
      parts.push(`width: ${this.widthPx}px`);
    }
    if (!this.visible) {
      parts.push('display: none');
    }
    return parts.length > 0 ? parts.join('; ') + ';' : '';
  }

  /**
   * Common handler for all five button clicks. Preserves the
   * original behavior of `e.preventDefault()` (so the `href="#"`
   * doesn't navigate to the page anchor) and then dispatches
   * the named event.
   */
  private handleClick(e: MouseEvent, eventName: string): void {
    e.preventDefault();
    this.dispatchEvent(
      new CustomEvent(eventName, { bubbles: true, composed: true })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'f-scrollback-bar': FScrollbackBar;
  }
}
