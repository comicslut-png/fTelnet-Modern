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
import { t, LANGUAGES, type Language, type LanguageInfo } from '@i18n/index.js';

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

/** Payload for the `settings-zmodem-auto-detect-change` event. */
export interface SettingsZModemAutoDetectChangeDetail {
  enabled: boolean;
}

/** Payload for the `settings-default-protocol-change` event. */
export interface SettingsDefaultProtocolChangeDetail {
  protocol: 'zmodem' | 'ymodem';
}

/** Payload for the `settings-language-change` event. */
export interface SettingsLanguageChangeDetail {
  language: Language;
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
 *   - `settings-zmodem-auto-detect-change` (...AutoDetectChangeDetail>)
 *   - `settings-default-protocol-change` (...DefaultProtocolChangeDetail>)
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
  /**
   * Version string shown in the About section. Bumped manually
   * to match package.json's version field. Kept as a static so
   * tests and the panel can read the same value without needing
   * a build-time injection mechanism.
   */
  public static readonly VERSION = '2.0.0-beta.32';

  @property({ type: Boolean })
  open = false;

  @property({ type: Number, attribute: 'page-x' })
  pageX = 0;

  @property({ type: Number, attribute: 'page-y' })
  pageY = 0;

  @property({ type: Array, attribute: false })
  themes: ThemeChoice[] = [
    { id: 'classic', label: 'Classic' },
    { id: 'dos-classic', label: 'DOS-Classic' },
    { id: 'crt-green', label: 'CRT-Green' },
    { id: 'cyberpunk', label: 'Cyberpunk' },
    { id: 'gothic', label: 'Gothic' },
    { id: 'cartoon', label: 'Cartoon' },
  ];

  @property({ type: String, attribute: 'current-theme' })
  currentTheme = 'classic';

  @property({ type: Boolean })
  muted = false;

  @property({ type: Number, attribute: 'vibrate-duration' })
  vibrateDuration = 25;

  /**
   * Whether the ZMODEM auto-detector is enabled. When true (the
   * default), the client watches inbound data for the ZMODEM
   * header and diverts to the receive state machine when it sees
   * one. When false, ZMODEM bytes pass through as terminal text
   * (which renders as garbage; the off-switch is for debugging or
   * for edge cases where auto-detect causes problems on a specific
   * BBS).
   */
  @property({ type: Boolean, attribute: 'zmodem-auto-detect' })
  zmodemAutoDetect = true;

  /**
   * Which protocol the menu's Upload and Download buttons act on.
   * Mirrors `fTelnetOptions.DefaultTransferProtocol`. Phase 5.
   */
  @property({ type: String, attribute: 'default-protocol' })
  defaultProtocol: 'zmodem' | 'ymodem' = 'zmodem';

  /**
   * Active UI language. Drives the panel's own labels via `t()`
   * and is the selected radio in the Language fieldset. Mirrors
   * `fTelnetOptions.Language`. Phase 5 (beta.6).
   */
  @property({ type: String })
  language: Language = 'en';

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const inlineStyle = this.buildInlineStyle();

    return html`
      <div class="fTelnetSettingsPanel" style=${inlineStyle}>
        <div class="fTelnetSettingsPanelHeader">
          ${t('settings.title', this.language)}
        </div>

        <!-- Row 1: Theme | Protocol | Language -->
        <div class="fTelnetSettingsPanelColumns">
          <div class="fTelnetSettingsPanelColumn">
            <fieldset class="fTelnetSettingsPanelGroup">
              <legend>${t('settings.theme', this.language)}</legend>
              ${this.themes.map(
                (th): TemplateResult => html`
                  <label class="fTelnetSettingsPanelOption">
                    <input
                      type="radio"
                      name="theme"
                      value=${th.id}
                      ?checked=${th.id === this.currentTheme}
                      @change=${this.handleThemeChange}
                    />
                    ${th.label}
                  </label>
                `
              )}
            </fieldset>
          </div>

          <div class="fTelnetSettingsPanelColumn">
            <fieldset class="fTelnetSettingsPanelGroup">
              <legend>${t('settings.protocol', this.language)}</legend>
              <div class="fTelnetSettingsPanelSubheader">
                ${t('settings.protocol.default', this.language)}
              </div>
              <label class="fTelnetSettingsPanelOption">
                <input
                  type="radio"
                  name="default-protocol"
                  value="zmodem"
                  ?checked=${this.defaultProtocol === 'zmodem'}
                  @change=${this.handleDefaultProtocolChange}
                />
                ZModem
              </label>
              <label class="fTelnetSettingsPanelOption">
                <input
                  type="radio"
                  name="default-protocol"
                  value="ymodem"
                  ?checked=${this.defaultProtocol === 'ymodem'}
                  @change=${this.handleDefaultProtocolChange}
                />
                YModem
              </label>
              <label
                class="fTelnetSettingsPanelOption fTelnetSettingsPanelOptionDisabled"
                title="Reserved for a future protocol"
              >
                <input
                  type="radio"
                  name="default-protocol-reserved"
                  value="reserved"
                  disabled
                />
                <span class="fTelnetSettingsPanelPlaceholder"></span>
              </label>
              <div class="fTelnetSettingsPanelDivider"></div>
              <label class="fTelnetSettingsPanelOption">
                <input
                  type="checkbox"
                  ?checked=${this.zmodemAutoDetect}
                  @change=${this.handleZModemAutoDetectChange}
                />
                ${t('settings.protocol.autodetect', this.language)}
              </label>
            </fieldset>
          </div>

          <div class="fTelnetSettingsPanelColumn fTelnetSettingsPanelColumnWide">
            <fieldset class="fTelnetSettingsPanelGroup">
              <legend>${t('settings.language', this.language)}</legend>
              <div class="fTelnetSettingsPanelLanguageColumns">
                ${this.languageColumns().map(
                  (col): TemplateResult => html`
                    <div class="fTelnetSettingsPanelLanguageColumn">
                      ${col.map(
                        (lang): TemplateResult => html`
                          <label
                            class="fTelnetSettingsPanelOption${lang.available
                              ? ''
                              : ' fTelnetSettingsPanelOptionDisabled'}"
                            title=${lang.available
                              ? ''
                              : t('settings.language.comingSoon', this.language)}
                          >
                            <input
                              type="radio"
                              name="language"
                              value=${lang.code}
                              ?checked=${lang.code === this.language}
                              ?disabled=${!lang.available}
                              @change=${this.handleLanguageChange}
                            />
                            ${lang.endonym}
                          </label>
                        `
                      )}
                    </div>
                  `
                )}
              </div>
            </fieldset>
          </div>
        </div>

        <!-- Row 2: Sound | Touch | (empty placeholder) -->
        <div class="fTelnetSettingsPanelColumns">
          <div class="fTelnetSettingsPanelColumn">
            <fieldset class="fTelnetSettingsPanelGroup">
              <legend>${t('settings.sound', this.language)}</legend>
              <label class="fTelnetSettingsPanelOption">
                <input
                  type="checkbox"
                  ?checked=${this.muted}
                  @change=${this.handleMuteChange}
                />
                ${t('settings.sound.mute', this.language)}
              </label>
            </fieldset>
          </div>

          <div class="fTelnetSettingsPanelColumn">
            <fieldset class="fTelnetSettingsPanelGroup">
              <legend>${t('settings.touch', this.language)}</legend>
              <label class="fTelnetSettingsPanelOption">
                ${t('settings.touch.vibrate', this.language)}
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  .value=${String(this.vibrateDuration)}
                  @change=${this.handleVibrateChange}
                  class="fTelnetSettingsPanelNumber"
                />
                ${t('settings.touch.ms', this.language)}
              </label>
            </fieldset>
          </div>

          <div class="fTelnetSettingsPanelColumn fTelnetSettingsPanelColumnWide">
            <fieldset
              class="fTelnetSettingsPanelGroup fTelnetSettingsPanelGroupReserved"
            ></fieldset>
          </div>
        </div>

        <fieldset class="fTelnetSettingsPanelGroup fTelnetSettingsPanelGroupFullWidth">
          <legend>${t('settings.about', this.language)}</legend>
          <div class="fTelnetSettingsPanelAbout">
            <div class="fTelnetSettingsPanelAboutColumns">
              <div class="fTelnetSettingsPanelAboutColumn">
                <div class="fTelnetSettingsPanelAboutLine">
                  <strong>fTelnet-Modern</strong> v${FSettingsPanel.VERSION}
                </div>
                <div class="fTelnetSettingsPanelAboutLine">
                  Modern fork by
                  <a
                    href="mailto:dangerbaybbs@hotmail.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    >Tom Swartz</a
                  >
                </div>
                <div class="fTelnetSettingsPanelAboutLine">
                  <a
                    href="https://github.com/comicslut-png/fTelnet-Modern"
                    target="_blank"
                    rel="noopener noreferrer"
                    >github.com/comicslut-png/fTelnet-Modern</a
                  >
                </div>
              </div>
              <div class="fTelnetSettingsPanelAboutColumn">
                <div class="fTelnetSettingsPanelAboutLine">
                  Based on <strong>fTelnet</strong>
                </div>
                <div class="fTelnetSettingsPanelAboutLine">
                  Copyright © 2009–2026
                  <a
                    href="https://www.rickparrish.ca"
                    target="_blank"
                    rel="noopener noreferrer"
                    >R&amp;M Software</a
                  >
                </div>
                <div class="fTelnetSettingsPanelAboutLine">
                  Original by Rick Parrish
                </div>
                <div class="fTelnetSettingsPanelAboutLine">
                  Licensed under
                  <a
                    href="https://www.gnu.org/licenses/agpl-3.0.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    >AGPL-3.0</a
                  >
                </div>
              </div>
            </div>
          </div>
        </fieldset>

        <div class="fTelnetSettingsPanelFooter">
          <a
            href="#"
            class="fTelnetSettingsPanelClose"
            @click=${this.handleCloseClick}
            >${t('settings.close', this.language)}</a
          >
        </div>
      </div>
    `;

  }

  /**
   * Position the panel as a viewport-centered modal-style overlay.
   * The settings panel is larger than the menu popup; anchoring it
   * to a click point can push it off-screen on shorter windows.
   * Centering it via the bulletproof CSS pattern (top/left 50% +
   * translate -50%) means it always renders fully visible and
   * always overlays the canvas area cleanly.
   *
   * Phase 5 polish: switched from `top = pageY - clientHeight`
   * (which depended on reading clientHeight post-render and
   * collapsed to AT-the-click-point on first open) to fixed
   * viewport-centered positioning. The pageX/pageY properties
   * are now ignored — kept for backward API compatibility but
   * the panel always renders centered.
   */
  private buildInlineStyle(): string {
    if (!this.open) {
      return 'display: none;';
    }
    return (
      'display: block;' +
      ' position: fixed;' +
      ' top: 50%;' +
      ' left: 50%;' +
      ' transform: translate(-50%, -50%);' +
      ' max-height: 90vh;' +
      ' overflow-y: auto;'
    );
  }

  /**
   * Click-outside-to-close. Same pattern as FMenuPopup:
   * listens for clicks anywhere in the document and closes the
   * panel if the click was outside this element. Microtask-deferred
   * attach so the click that opened the panel doesn't immediately
   * close it.
   */
  private _outsideClickHandler = (e: MouseEvent): void => {
    if (!this.open) return;
    const target = e.target as Node;
    if (!this.contains(target)) {
      this.open = false;
      this.dispatchEvent(
        new CustomEvent('settings-close', {
          bubbles: true,
          composed: true,
        }),
      );
    }
  };

  public override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    if (changed.has('open')) {
      if (this.open) {
        queueMicrotask(() => {
          document.addEventListener('mousedown', this._outsideClickHandler, true);
        });
      } else {
        document.removeEventListener('mousedown', this._outsideClickHandler, true);
      }
    }
  }

  public override disconnectedCallback(): void {
    document.removeEventListener('mousedown', this._outsideClickHandler, true);
    super.disconnectedCallback();
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

  private handleZModemAutoDetectChange = (e: Event): void => {
    const checked = (e.target as HTMLInputElement).checked;
    this.dispatchEvent(
      new CustomEvent<SettingsZModemAutoDetectChangeDetail>(
        'settings-zmodem-auto-detect-change',
        {
          detail: { enabled: checked },
          bubbles: true,
          composed: true,
        },
      ),
    );
  };

  private handleDefaultProtocolChange = (e: Event): void => {
    const value = (e.target as HTMLInputElement).value;
    if (value !== 'zmodem' && value !== 'ymodem') {
      return;
    }
    this.dispatchEvent(
      new CustomEvent<SettingsDefaultProtocolChangeDetail>(
        'settings-default-protocol-change',
        {
          detail: { protocol: value },
          bubbles: true,
          composed: true,
        },
      ),
    );
  };

  /**
   * Split the registered languages into display columns of at most
   * MAX_LANGUAGES_PER_COLUMN each, preserving registry order. The
   * Settings Language fieldset renders one sub-column per chunk.
   *
   * Capping the column height keeps the fieldset from growing
   * arbitrarily tall as languages are added — overflow flows into a
   * new column instead. With 11 languages and a cap of 5 that yields
   * three columns (5 + 5 + 1); adding more simply extends or adds
   * columns automatically, no layout edit needed. The columns are
   * spread evenly across the fieldset width (see the CSS).
   */
  private static readonly MAX_LANGUAGES_PER_COLUMN = 5;

  private languageColumns(): LanguageInfo[][] {
    const perColumn = FSettingsPanel.MAX_LANGUAGES_PER_COLUMN;
    const columns: LanguageInfo[][] = [];
    for (let i = 0; i < LANGUAGES.length; i += perColumn) {
      columns.push(LANGUAGES.slice(i, i + perColumn));
    }
    return columns;
  }

  private handleLanguageChange = (e: Event): void => {
    const value = (e.target as HTMLInputElement).value;
    // Only functional languages have enabled radios that can fire
    // this; the placeholder ('other') radios are disabled. Guard
    // against anything unexpected by checking it's a known
    // available language code before dispatching.
    const known = LANGUAGES.find((l) => l.code === value && l.available);
    if (known === undefined) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent<SettingsLanguageChangeDetail>(
        'settings-language-change',
        {
          detail: { language: known.code },
          bubbles: true,
          composed: true,
        },
      ),
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
