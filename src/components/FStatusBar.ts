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
 *     to "Disconnect" while connected, "Reconnect" after a drop,
 *     and "Retry Connection" after a security error.
 *   - `connectButtonVisible` (boolean, default true) — hidden only
 *     during the brief "Connecting…" in-flight phase; otherwise
 *     shown so the bar's primary action button is always one click
 *     away.
 *   - `menuButtonVisible` (boolean, default true) — set false in
 *     embed deployments (via `Options.AllowMenu = false`) to hide
 *     the Menu button entirely.
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
 *   - `connect-click` — Connect / Disconnect / Reconnect / Retry
 *     Connection button clicked. No payload — the action is in the
 *     name. The parent decides what to do based on the current
 *     connection state (calling Connect or Disconnect).
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
 * Note on the API surface: Phase 2 Stage 4 used a primitive
 * `backgroundColor: string` property here, with fTelnetClient
 * writing literal color strings (`'blue'`, `'red'`, `''`) that
 * got stamped as inline CSS. That worked for the classic theme
 * but broke under Phase 3 theming — inline `background-color`
 * always wins against `var(--ft-status-active-bg)` from a theme
 * block, so theme colors couldn't override the imperative
 * inline values.
 *
 * Phase 3 Stage 1.1 replaced it with a semantic `state` enum:
 *   - 'idle'   — no special styling (initial state)
 *   - 'active' — connecting / connected (was 'blue')
 *   - 'error'  — disconnected / security failure (was 'red')
 *
 * The component renders the state as a `data-state` attribute
 * on the inner `.fTelnetStatusBar` div; CSS reads the attribute
 * to pick colors per-theme. Component is now fully theme-
 * agnostic.
 */
@customElement('f-status-bar')
export class FStatusBar extends LitElement {
  @property({ type: String, attribute: 'status-text' })
  statusText = 'Not connected';

  @property({ type: String, attribute: 'connect-button-text' })
  connectButtonText = 'Connect';

  /**
   * Whether the status-bar action button (Connect / Disconnect /
   * Reconnect / Retry Connection) is shown.
   *
   * Defaults to TRUE so the initial idle state shows a Connect button
   * directly on the bar — the same one-click entry point users expect
   * from a terminal client. The button is state-aware: it reads
   * "Connect" while idle, switches to "Disconnect" while connected,
   * and to "Reconnect" / "Retry Connection" after a drop or failed
   * attempt (fTelnetClient updates the text in OnConnectionConnect /
   * OnConnectionClose / OnConnectionSecurityError). It is hidden only
   * during the brief "Connecting…" in-flight phase to prevent
   * double-clicks. Connect / Disconnect remain available in the menu
   * popup too; the bar button is just the primary path.
   */
  @property({ type: Boolean, attribute: 'connect-button-visible' })
  connectButtonVisible = true;

  /**
   * Whether the Menu button is shown on the status bar.
   *
   * Defaults to TRUE. When set to FALSE (embed deployments via
   * `Options.AllowMenu = false`) the button is hidden entirely
   * rather than greyed out — embedded users see only the Connect
   * button and the status label, and have no way to reach the menu
   * drop-down (Settings, Copy/Paste, Upload/Download, Keyboard,
   * Full Screen). The Connect button on the bar remains interactive
   * regardless, so the primary action is always available.
   */
  @property({ type: Boolean, attribute: 'menu-button-visible' })
  menuButtonVisible = true;

  /**
   * Semantic connection state. Drives the background color and
   * border via CSS — themes decide what each state looks like.
   *
   * Phase 2's `backgroundColor` property is gone; fTelnetClient
   * updated its 7 call sites to use this instead.
   */
  @property({ type: String })
  state: 'idle' | 'active' | 'error' = 'idle';

  @property({ type: Number, attribute: 'width-px' })
  widthPx = 0;

  /**
   * Active UI language — drives the localized "Menu" button label.
   * The dynamic statusText and connectButtonText are composed and
   * pushed by fTelnetClient (already localized there), so this
   * property only governs the bits the component renders itself.
   * Phase 5 (beta.6).
   */
  @property({ type: String })
  language: Language = 'en';

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const inlineStyle: string = this.buildInlineStyle();

    return html`
      <div
        class="fTelnetStatusBar"
        data-state=${this.state}
        style=${inlineStyle}
      >
        <a
          class="fTelnetMenuButton"
          href="#"
          style=${this.menuButtonVisible ? '' : 'display: none;'}
          @click=${this.handleMenuClick}
          >${t('menu.button', this.language)}</a
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
   * Inline style now carries only the width. Background color
   * comes from CSS, driven by the `data-state` attribute.
   */
  private buildInlineStyle(): string {
    if (this.widthPx > 0) {
      return `width: ${this.widthPx}px;`;
    }
    return '';
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
   * Status-bar action button click handler. No payload — the action
   * is implicit. The button text varies (Connect / Disconnect /
   * Reconnect / Retry Connection) and the parent decides the action
   * from the current connection state.
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
