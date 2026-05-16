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

/** Available themes, including their display labels. */
export interface ThemeChoice {
  id: string;
  label: string;
}

/** Payload for the `settings-theme-change` event. */
export interface SettingsThemeChangeDetail {
  theme: string;
}

/** Payload for the `settings-mute-change` event. */
export interface SettingsMuteChangeDetail {
  muted: boolean;
}

/** Payload for the `settings-vibrate-change` event. */
export interface SettingsVibrateChangeDetail {
  duration: number;
}

/**
 * `<f-settings-panel>` — runtime user preferences UI. Opened from
 * the menu popup via the new "Settings..." action; floats over the
 * page like the menu popup does. Contains:
 *
 *   - **Theme picker** (radio buttons, one per available theme,
 *     each labeled "🎨 themename" per the user's request)
 *   - **Mute toggle** (checkbox) — silences the PC-speaker bell
 *     emulation, fixing the paste-bell-stream issue
 *   - **Vibrate duration** (number input 0-100ms) — haptic
 *     feedback strength for the virtual keyboard
 *   - **Close button** at the bottom
 *
 * Properties:
 *   - `open` (boolean, default false) — visibility
 *   - `pageX` (number, default 0) — left coordinate when open
 *   - `pageY` (number, default 0) — top coordinate when open
 *   - `themes` (ThemeChoice[]) — the list of pickable themes
 *   - `currentTheme` (string) — the currently-selected theme id
 *   - `muted` (boolean) — current mute state
 *   - `vibrateDuration` (number) — current vibrate ms
 *
 * Events (all bubble + composed):
 *   - `settings-theme-change` (CustomEvent<SettingsThemeChangeDetail>)
 *   - `settings-mute-change` (CustomEvent<SettingsMuteChangeDetail>)
 *   - `settings-vibrate-change` (CustomEvent<SettingsVibrateChangeDetail>)
 *   - `settings-close` — the close button was clicked
 *
 * Live updates: each change dispatches immediately so the user
 * sees the effect right away (e.g. selecting a theme reskins
 * instantly). No "save" button.
 *
 * Persistence: fTelnetClient owns localStorage writes. The
 * component just dispatches events.
 *
 * CSS: light DOM. Styles live in ftelnet.css under
 * `.fTelnetSettingsPanel` and its descendants, with theme-aware
 * overrides via `[data-theme="..."]` selectors.
 */
@customElement('f-settings-panel')
export class FSettingsPanel extends LitElement {
  @property({ type: Boolean })
  open = false;

  @property({ type: Number, attribute: 'page-x' })
  pageX = 0;

  @property({ type: Number, attribute: 'page-y' })
  pageY = 0;

  @property({ type: Array, attribute: false })
  themes: ThemeChoice[] = [
    { id: 'classic', label: 'classic' },
    { id: 'dos-classic', label: 'dos-classic' },
    { id: 'crt-green', label: 'crt-green' },
    { id: 'cyberpunk', label: 'cyberpunk' },
    { id: 'gothic', label: 'gothic' },
    { id: 'cartoon', label: 'cartoon' },
  ];

  @property({ type: String, attribute: 'current-theme' })
  currentTheme = 'classic';

  @property({ type: Boolean })
  muted = false;

  @property({ type: Number, attribute: 'vibrate-duration' })
  vibrateDuration = 25;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const inlineStyle = this.buildInlineStyle();

    return html`
      <div class="fTelnetSettingsPanel" style=${inlineStyle}>
        <div class="fTelnetSettingsPanelHeader">Settings</div>

        <fieldset class="fTelnetSettingsPanelGroup">
          <legend>Theme</legend>
          ${this.themes.map(
            (t): TemplateResult => html`
              <label class="fTelnetSettingsPanelOption">
                <input
                  type="radio"
                  name="theme"
                  value=${t.id}
                  ?checked=${t.id === this.currentTheme}
                  @change=${this.handleThemeChange}
                />
                🎨 ${t.label}
              </label>
            `
          )}
        </fieldset>

        <fieldset class="fTelnetSettingsPanelGroup">
          <legend>Sound</legend>
          <label class="fTelnetSettingsPanelOption">
            <input
              type="checkbox"
              ?checked=${this.muted}
              @change=${this.handleMuteChange}
            />
            🔇 Mute bell sounds
          </label>
        </fieldset>

        <fieldset class="fTelnetSettingsPanelGroup">
          <legend>Touch</legend>
          <label class="fTelnetSettingsPanelOption">
            📳 Vibrate duration:
            <input
              type="number"
              min="0"
              max="100"
              step="5"
              .value=${String(this.vibrateDuration)}
              @change=${this.handleVibrateChange}
              class="fTelnetSettingsPanelNumber"
            />
            ms
          </label>
        </fieldset>

        <div class="fTelnetSettingsPanelFooter">
          <a
            href="#"
            class="fTelnetSettingsPanelClose"
            @click=${this.handleCloseClick}
            >Close</a
          >
        </div>
      </div>
    `;
  }

  /**
   * Position the panel where the click happened, accounting for
   * its own height so it floats above the click point. Same
   * positioning logic as FMenuPopup.
   */
  private buildInlineStyle(): string {
    if (!this.open) {
      return 'display: none;';
    }
    const top = this.pageY - this.clientHeight;
    return `display: block; left: ${this.pageX}px; top: ${top}px;`;
  }

  private handleThemeChange = (e: Event): void => {
    const value = (e.target as HTMLInputElement).value;
    this.dispatchEvent(
      new CustomEvent<SettingsThemeChangeDetail>('settings-theme-change', {
        detail: { theme: value },
        bubbles: true,
        composed: true,
      })
    );
  };

  private handleMuteChange = (e: Event): void => {
    const checked = (e.target as HTMLInputElement).checked;
    this.dispatchEvent(
      new CustomEvent<SettingsMuteChangeDetail>('settings-mute-change', {
        detail: { muted: checked },
        bubbles: true,
        composed: true,
      })
    );
  };

  private handleVibrateChange = (e: Event): void => {
    const raw = (e.target as HTMLInputElement).value;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) {
      return;
    }
    // Clamp to 0..100.
    const clamped = Math.max(0, Math.min(100, n));
    this.dispatchEvent(
      new CustomEvent<SettingsVibrateChangeDetail>('settings-vibrate-change', {
        detail: { duration: clamped },
        bubbles: true,
        composed: true,
      })
    );
  };

  private handleCloseClick = (e: MouseEvent): void => {
    e.preventDefault();
    this.dispatchEvent(
      new CustomEvent('settings-close', { bubbles: true, composed: true })
    );
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'f-settings-panel': FSettingsPanel;
  }
}
