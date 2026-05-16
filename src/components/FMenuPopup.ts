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
 * Names for actions dispatched via the `menu-action` event.
 *
 * Each name corresponds to one menu button. Mapping to fTelnetClient
 * methods (this list is the parent's responsibility, kept here as
 * documentation):
 *   - connect          → Connect()
 *   - disconnect       → Disconnect(true)
 *   - copy             → ClipboardCopy()
 *   - paste            → ClipboardPaste()
 *   - upload           → Upload()
 *   - download         → Download()
 *   - keyboard-toggle  → VirtualKeyboardVisible = !VirtualKeyboardVisible
 *   - fullscreen       → FullScreenToggle()
 *   - enter-scrollback → EnterScrollback()
 *
 * The screen-size dropdown emits a separate `screen-size-change`
 * event since it carries data (new dimensions) rather than just
 * being a binary action.
 */
export type MenuActionName =
  | 'connect'
  | 'disconnect'
  | 'copy'
  | 'paste'
  | 'upload'
  | 'download'
  | 'keyboard-toggle'
  | 'fullscreen'
  | 'enter-scrollback'
  | 'settings';

/** Payload for the `menu-action` event. */
export interface MenuActionDetail {
  action: MenuActionName;
}

/** Payload for the `screen-size-change` event. */
export interface ScreenSizeChangeDetail {
  columns: number;
  rows: number;
}

/**
 * `<f-menu-popup>` — the popup overlay shown when the user clicks
 * the **Menu** button in the status bar. Contains action buttons
 * (Connect, Disconnect, Copy, Paste, Upload, Download, Keyboard,
 * Full Screen, optionally View Scrollback Buffer) and a screen-
 * size dropdown.
 *
 * Properties:
 *   - `open` (boolean, default false) — visible / hidden.
 *   - `pageX` (number, default 0) — left position when open.
 *   - `pageY` (number, default 0) — Y coordinate of the originating
 *     click. The popup positions its top edge at
 *     `pageY - clientHeight` so it floats above the click point —
 *     same as the original.
 *   - `showCopyPaste` (boolean, default false) — render the
 *     Copy/Paste row. Phase 1's original gated this on
 *     `!DetectMobileBrowser.IsMobile` since touch UIs don't have
 *     useful canvas selection. Parent computes the bool.
 *   - `showScrollback` (boolean, default false) — render the
 *     View Scrollback Buffer row. Phase 1's original gated this
 *     on `!_UseModernScrollback` since modern scrollback uses
 *     native scrolling. Parent computes the bool.
 *   - `currentScreenSize` (string, default "80x25") — the
 *     currently-selected screen-size dropdown value, formatted
 *     as "WxH".
 *   - `supportedScreenSizes` (string[]) — the options shown in
 *     the dropdown. Parent computes this, including the
 *     "unshift currentScreenSize if not in the default list"
 *     behavior that lets users persist non-standard sizes.
 *
 * Events:
 *   - `menu-action` (CustomEvent<MenuActionDetail>) — one of the
 *     action buttons was clicked. detail.action identifies which.
 *   - `screen-size-change` (CustomEvent<ScreenSizeChangeDetail>) —
 *     a new size was selected from the dropdown.
 *
 * Both events `bubbles: true, composed: true`.
 *
 * Design note: a single `menu-action` event with a typed
 * discriminator beats 8-9 separate per-action events here. The
 * actions are semantically homogeneous from the popup's
 * perspective — it's just "user clicked something." The
 * variation lives in what fTelnetClient does in response. With
 * the single-event approach, the parent has one listener and
 * a switch statement; with separate events it'd be 8-9
 * `addEventListener` calls. (Compare with <f-scrollback-bar>,
 * which dispatches 5 specific events because each scrollback
 * action drives a different Crt key code. There the names
 * have semantic meaning to the parent. Here they don't.)
 *
 * The screen-size dropdown is separate because it carries data
 * (new dimensions) not just a binary "this happened."
 *
 * CSS: inherits styles from `.fTelnetMenuButtons` and
 * `.fTelnetMenuButtons {a, select, table, td}` in ftelnet.css.
 * Light DOM so those selectors continue to apply.
 *
 * Replaces ~205 lines of imperative DOM construction in the
 * Phase 1 fTelnetClient.ts constructor — the largest single
 * piece of UI chrome in Phase 2. Caller-side, the eight
 * `this._MenuButtons.style.display = 'none'` lines scattered
 * across the public action methods become a single `Open = false`
 * write (or just `this._MenuButtons.open = false` — the parent
 * chooses the naming).
 */
@customElement('f-menu-popup')
export class FMenuPopup extends LitElement {
  @property({ type: Boolean })
  open = false;

  @property({ type: Number, attribute: 'page-x' })
  pageX = 0;

  @property({ type: Number, attribute: 'page-y' })
  pageY = 0;

  @property({ type: Boolean, attribute: 'show-copy-paste' })
  showCopyPaste = false;

  @property({ type: Boolean, attribute: 'show-scrollback' })
  showScrollback = false;

  @property({ type: String, attribute: 'current-screen-size' })
  currentScreenSize = '80x25';

  // Default supportedScreenSizes if the parent never sets it.
  // Parent typically computes this (with the "current size if not
  // standard" prepended) at construction time and assigns once.
  @property({ type: Array, attribute: false })
  supportedScreenSizes: string[] = [
    '80x25',
    '80x28',
    '80x30',
    '80x43',
    '80x50',
    '80x60',
    '132x37',
    '132x52',
    '132x25',
    '132x28',
    '132x30',
    '132x34',
    '132x43',
    '132x50',
    '132x60',
  ];

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const inlineStyle: string = this.buildInlineStyle();

    return html`
      <div class="fTelnetMenuButtons" style=${inlineStyle}>
        <table>
          <tr>
            <td>
              <a href="#" @click=${(e: MouseEvent): void => this.handleAction(e, 'connect')}
                >Connect</a
              >
            </td>
            <td>
              <a href="#" @click=${(e: MouseEvent): void => this.handleAction(e, 'disconnect')}
                >Disconnect</a
              >
            </td>
          </tr>
          ${this.showCopyPaste
            ? html`
                <tr>
                  <td>
                    <a href="#" @click=${(e: MouseEvent): void => this.handleAction(e, 'copy')}
                      >Copy</a
                    >
                  </td>
                  <td>
                    <a href="#" @click=${(e: MouseEvent): void => this.handleAction(e, 'paste')}
                      >Paste</a
                    >
                  </td>
                </tr>
              `
            : ''}
          <tr>
            <td>
              <a href="#" @click=${(e: MouseEvent): void => this.handleAction(e, 'upload')}
                >Upload</a
              >
            </td>
            <td>
              <a href="#" @click=${(e: MouseEvent): void => this.handleAction(e, 'download')}
                >Download</a
              >
            </td>
          </tr>
          <tr>
            <td>
              <a
                href="#"
                @click=${(e: MouseEvent): void => this.handleAction(e, 'keyboard-toggle')}
                >Keyboard</a
              >
            </td>
            <td>
              <a
                href="#"
                @click=${(e: MouseEvent): void => this.handleAction(e, 'fullscreen')}
                .innerHTML=${'Full&nbsp;Screen'}
              ></a>
            </td>
          </tr>
          ${this.showScrollback
            ? html`
                <tr>
                  <td colspan="2">
                    <a
                      href="#"
                      @click=${(e: MouseEvent): void =>
                        this.handleAction(e, 'enter-scrollback')}
                      >View Scrollback Buffer</a
                    >
                  </td>
                </tr>
              `
            : ''}
          <tr>
            <td colspan="2">
              <a
                href="#"
                @click=${(e: MouseEvent): void => this.handleAction(e, 'settings')}
                >Settings...</a
              >
            </td>
          </tr>
          <tr>
            <td colspan="2">
              <select @change=${this.handleScreenSizeChange}>
                ${this.supportedScreenSizes.map(
                  (size: string): TemplateResult => {
                    const [cols, rows] = size.split('x');
                    let label = `${cols} columns x ${rows} rows`;
                    if (size === '132x37') {
                      label += ' (16:9)';
                    } else if (size === '132x52') {
                      label += ' (5:4)';
                    }
                    return html`<option
                      value=${size}
                      ?selected=${size === this.currentScreenSize}
                    >
                      ${label}
                    </option>`;
                  }
                )}
              </select>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  /**
   * Assemble the inline style for the wrapper div. Combines:
   *   - display: none/block based on `open`
   *   - left/top based on pageX/pageY (when open)
   *   - z-index: 1500 (TODO: move to CSS in Phase 3 — preserved
   *     from the original `style.zIndex = '1500'` assignment)
   *
   * Top position is `pageY - clientHeight` to float the popup
   * *above* the click point. The component reads its own
   * clientHeight after the first render to compute this; if
   * clientHeight is 0 (initial render before layout), we fall
   * back to placing the popup at pageY directly.
   *
   * Phase 3 Stage 1 note: the original code's `z-index: 1500` is
   * now in ftelnet.css under the `.fTelnetMenuButtons` rule, so
   * we don't include it in the inline style anymore. Removing
   * the magic number from inline-JS code was a long-standing
   * TODO; CSS is where it belongs.
   */
  private buildInlineStyle(): string {
    if (!this.open) {
      return 'display: none;';
    }

    const top = this.pageY - this.clientHeight;
    return `display: block; left: ${this.pageX}px; top: ${top}px;`;
  }

  /**
   * One handler for all the action-button clicks. Each call site
   * passes the discriminator. Preserves preventDefault for `href="#"`
   * navigation suppression.
   */
  private handleAction(e: MouseEvent, action: MenuActionName): void {
    e.preventDefault();
    this.dispatchEvent(
      new CustomEvent<MenuActionDetail>('menu-action', {
        detail: { action },
        bubbles: true,
        composed: true,
      })
    );
  }

  /**
   * Screen-size dropdown change handler. Splits "WxH" back into
   * column/row numbers and dispatches with structured detail.
   */
  private handleScreenSizeChange = (e: Event): void => {
    const value = (e.target as HTMLSelectElement).value;
    const [cols, rows] = value.split('x');
    if (cols === undefined || rows === undefined) {
      return;
    }
    const columns = parseInt(cols, 10);
    const rowsN = parseInt(rows, 10);
    if (Number.isNaN(columns) || Number.isNaN(rowsN)) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent<ScreenSizeChangeDetail>('screen-size-change', {
        detail: { columns, rows: rowsN },
        bubbles: true,
        composed: true,
      })
    );
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'f-menu-popup': FMenuPopup;
  }
}
