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
 * `<f-focus-warning>` — the red "*** CLICK HERE TO ENABLE KEYBOARD INPUT ***"
 * banner that shows when the browser tab loses focus while connected
 * to a BBS.
 *
 * Properties:
 *   - `visible` (boolean, default false) — controls display
 *   - `widthPx` (number, default 0) — explicit width in pixels;
 *     when 0, the bar inherits its parent's width via CSS.
 *
 * Events: none. Passive display component.
 *
 * CSS: inherits styles from `.fTelnetFocusWarning` in ftelnet.css
 * (background-color: red, etc.). Renders into light DOM so the
 * existing class-based CSS continues to apply.
 *
 * The original imperative-DOM version lived directly inside
 * `fTelnetClient.ts`'s constructor (lines 378-382 of the Phase 1
 * version). It was the smallest piece of UI chrome, which is why
 * it's the first conversion target — establishes the pattern that
 * subsequent components follow.
 *
 * The visibility is driven by `fTelnetClient.OnTimer()`, which
 * polls `document.hasFocus()` every 250ms and flips `visible`
 * accordingly. No click handler — the user clicking the bar (or
 * anywhere else in the document) gives the browser focus, which
 * the next tick detects and hides the bar. Same contract as the
 * original.
 */
@customElement('f-focus-warning')
export class FFocusWarning extends LitElement {
  @property({ type: Boolean })
  visible = false;

  @property({ type: Number, attribute: 'width-px' })
  widthPx = 0;

  /** Active UI language; drives the warning text via t(). */
  @property({ type: String })
  language: Language = 'en';

  /**
   * Render into light DOM so the existing `.fTelnetFocusWarning`
   * selectors in ftelnet.css apply without modification.
   */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    // Build the inline style only when one of its inputs is set.
    // An empty string makes Lit drop the attribute entirely;
    // anything else gets stamped in as-is.
    const inlineStyle: string = this.visible
      ? this.widthPx > 0
        ? `width: ${this.widthPx}px;`
        : ''
      : this.widthPx > 0
        ? `width: ${this.widthPx}px; display: none;`
        : 'display: none;';

    return html`
      <div class="fTelnetFocusWarning" style=${inlineStyle}>
        ${t('focus.message', this.language)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'f-focus-warning': FFocusWarning;
  }
}
