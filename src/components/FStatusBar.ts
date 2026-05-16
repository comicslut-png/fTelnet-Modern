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

/**
 * Payload for the `menu-click` custom event.
 *
 * Carries the click coordinates so the parent can position its
 * popup near the button. The Phase 1 `OnMenuButtonClick(e)`
 * handler read `e.pageX` / `e.pageY` directly; this preserves
 * the same data flow with a small structured payload instead
 * of the full MouseEvent.
 */
export interface MenuClickDetail {
  pageX: number;
  pageY: number;
}

/**
 * `<f-status-bar>` — the persistent bar below the BBS canvas with
 * Menu / Connect buttons and a status-text label.
 *
 * Properties:
 *   - `statusText` (string, default "Not connected") — the label
 *     content. The parent (fTelnetClient) sets this to messages
 *     like "Connecting to bbs.example.com:23 via proxy.example.com".
 *   - `connectButtonText` (string, default "Connect") — also set
 *     to "Reconnect" after disconnect and "Retry Connection"
 *     after a security error.
 *   - `connectButtonVisible` (boolean, default true) — hidden
 *     while connecting, shown when disconnected or in error.
 *   - `backgroundColor` (string, default '') — the inline
 *     `background-color` for the bar. Empty string means "use
 *     the CSS default" (blue). The parent sets 'blue' during
 *     connection lifecycle (redundant with the CSS default but
 *     preserved verbatim from the original) and 'red' on
 *     disconnect / security error.
 *   - `widthPx` (number, default 0) — explicit width; 0 = inherit.
 *
 * Events:
 *   - `menu-click` (CustomEvent<MenuClickDetail>) — Menu button
 *     clicked. The detail carries the original click coordinates
 *     so the parent can position its popup.
 *   - `connect-click` — Connect / Reconnect / Retry Connection
 *     button clicked. No payload — the action is in the name.
 *
 * Both events `bubbles: true, composed: true`.
 *
 * CSS: inherits styles from `.fTelnetStatusBar`,
 * `.fTelnetMenuButton`, `.fTelnetConnectButton`,
 * `.fTelnetStatusBarLabel` in ftelnet.css. Light DOM so those
 * selectors continue to apply.
 *
 * Replaces ~40 lines of imperative DOM construction in the
 * Phase 1 `fTelnetClient.ts` constructor, plus six in-place
 * `_StatusBarLabel.innerHTML = ...` / `_ConnectButton.innerHTML = ...`
 * updates scattered across `Connect()`, `OnConnectionConnect()`,
 * `OnConnectionClose()`, and `OnConnectionSecurityError()`. Those
 * all become single property writes on this component.
 *
 * Note on the API surface: the properties are deliberately
 * "primitive" rather than semantic (no `state: 'connecting' | ...`
 * enum). The original code computes the label, button text, and
 * background color explicitly at each transition site. Migrating
 * to primitive properties preserves that contract verbatim;
 * Phase 3 (chrome facelift) can introduce semantic state when it
 * actually helps the visual design.
 */
@customElement('f-status-bar')
export class FStatusBar extends LitElement {
  @property({ type: String, attribute: 'status-text' })
  statusText = 'Not connected';

  @property({ type: String, attribute: 'connect-button-text' })
  connectButtonText = 'Connect';

  @property({ type: Boolean, attribute: 'connect-button-visible' })
  connectButtonVisible = true;

  @property({ type: String, attribute: 'background-color' })
  backgroundColor = '';

  @property({ type: Number, attribute: 'width-px' })
  widthPx = 0;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const inlineStyle: string = this.buildInlineStyle();

    return html`
      <div class="fTelnetStatusBar" style=${inlineStyle}>
        <a
          class="fTelnetMenuButton"
          href="#"
          @click=${this.handleMenuClick}
          >Menu</a
        >
        <a
          class="fTelnetConnectButton"
          href="#"
          style=${this.connectButtonVisible ? '' : 'display: none;'}
          @click=${this.handleConnectClick}
          >${this.connectButtonText}</a
        >
        <span class="fTelnetStatusBarLabel">${this.statusText}</span>
      </div>
    `;
  }

  /**
   * Combine width + background color into a single inline `style`.
   * Same pattern as FFocusWarning and FScrollbackBar.
   */
  private buildInlineStyle(): string {
    const parts: string[] = [];
    if (this.widthPx > 0) {
      parts.push(`width: ${this.widthPx}px`);
    }
    if (this.backgroundColor !== '') {
      parts.push(`background-color: ${this.backgroundColor}`);
    }
    return parts.length > 0 ? parts.join('; ') + ';' : '';
  }

  /**
   * Menu button click handler. Preserves the original
   * `preventDefault()` (so `href="#"` doesn't navigate) and
   * dispatches a `menu-click` CustomEvent carrying the click
   * coordinates.
   *
   * The coordinates are extracted from the MouseEvent and passed
   * as a structured `detail` rather than forwarding the
   * MouseEvent itself — that's the convention going forward for
   * any component event that needs to carry payload.
   */
  private handleMenuClick = (e: MouseEvent): void => {
    e.preventDefault();
    const detail: MenuClickDetail = {
      pageX: e.pageX,
      pageY: e.pageY,
    };
    this.dispatchEvent(
      new CustomEvent<MenuClickDetail>('menu-click', {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  };

  /**
   * Connect button click handler. No payload — the action is
   * binary, the button text varies but the meaning ("user wants
   * to start a connection") is the same.
   */
  private handleConnectClick = (e: MouseEvent): void => {
    e.preventDefault();
    this.dispatchEvent(
      new CustomEvent('connect-click', { bubbles: true, composed: true })
    );
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'f-status-bar': FStatusBar;
  }
}
