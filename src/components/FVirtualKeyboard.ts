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

import { LitElement, html, type TemplateResult, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { KeyboardKeys } from '../crt/index.js';

/**
 * Tuple shape for a key on the virtual keyboard:
 *
 *   [0] keyCode          — DOM key code (e.g. 13 for Enter)
 *   [1] label            — HTML to render inside the key div
 *   [2] charCodeShifted  — char code emitted when shift is held;
 *                          0 if this is a "special" (non-character)
 *                          key like Enter, Tab, F1, arrows, etc.
 *   [3] charCodeNormal   — char code emitted with no modifiers
 */
type KeyDef = [number, string, number, number];

/**
 * Payload for the `vk-key-down` / `vk-key-press` custom events.
 *
 * Matches the parameter order of `Crt.PushKeyDown` /
 * `Crt.PushKeyPress` so the parent (fTelnetClient) can forward
 * the event to the Crt 1:1 — no shape juggling required.
 */
export interface VKKeyEventDetail {
  charCode: number;
  keyCode: number;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

/**
 * The 6 rows of the keyboard. Module-scope constant; the layout
 * never changes between instances. Preserved verbatim from the
 * Phase 1 / original implementation — every keyCode, label, and
 * char code matches. Whitespace and `<br />` tags in labels are
 * intentional (they style dual-character keys like "!<br />1"
 * with the shifted variant above the unshifted).
 */
const ROWS: KeyDef[][] = [
  [
    [27, 'Esc', 0, 0],
    [112, 'F1', 0, 0],
    [113, 'F2', 0, 0],
    [114, 'F3', 0, 0],
    [115, 'F4', 0, 0],
    [116, 'F5', 0, 0],
    [117, 'F6', 0, 0],
    [118, 'F7', 0, 0],
    [119, 'F8', 0, 0],
    [120, 'F9', 0, 0],
    [121, 'F10', 0, 0],
    [122, 'F11', 0, 0],
    [123, 'F12', 0, 0],
    [36, 'Home', 0, 0],
    [35, 'End', 0, 0],
    [45, 'Ins', 0, 0],
    [46, 'Del', 0, 0],
  ],
  [
    [192, '~<br />`', 126, 96],
    [49, '!<br />1', 33, 49],
    [50, '@<br />2', 64, 50],
    [51, '#<br />3', 35, 51],
    [52, '$<br />4', 36, 52],
    [53, '%<br />5', 37, 53],
    [54, '^<br />6', 94, 54],
    [55, '&<br />7', 38, 55],
    [56, '*<br />8', 42, 56],
    [57, '(<br />9', 40, 57],
    [48, ')<br />0', 41, 48],
    [173, '_<br />-', 95, 45],
    [61, '+<br />=', 43, 61],
    [8, 'Backspace', 0, 0],
  ],
  [
    [9, 'Tab', 0, 0],
    [81, 'Q', 81, 113],
    [87, 'W', 87, 119],
    [69, 'E', 69, 101],
    [82, 'R', 82, 114],
    [84, 'T', 84, 116],
    [89, 'Y', 89, 121],
    [85, 'U', 85, 117],
    [73, 'I', 73, 105],
    [79, 'O', 79, 111],
    [80, 'P', 80, 112],
    [219, '{<br />[', 123, 91],
    [221, '}<br />]', 125, 93],
    [220, '|<br />\\', 124, 92],
  ],
  [
    [20, 'Caps Lock', 0, 0],
    [65, 'A', 65, 97],
    [83, 'S', 83, 115],
    [68, 'D', 68, 100],
    [70, 'F', 70, 102],
    [71, 'G', 71, 103],
    [72, 'H', 72, 104],
    [74, 'J', 74, 106],
    [75, 'K', 75, 107],
    [76, 'L', 76, 108],
    [59, ':<br />;', 58, 59],
    [222, '"<br />\'', 34, 39],
    [13, 'Enter', 0, 0],
  ],
  [
    [1004, 'Shift', 0, 0],
    [90, 'Z', 90, 122],
    [88, 'X', 88, 120],
    [67, 'C', 67, 99],
    [86, 'V', 86, 118],
    [66, 'B', 66, 98],
    [78, 'N', 78, 110],
    [77, 'M', 77, 109],
    [188, '&lt;<br />,', 60, 44],
    [190, '&gt;<br />.', 62, 46],
    [191, '?<br />/', 63, 47],
    [33, 'Page<br />Up', 0, 0],
    [38, '', 0, 0], // Arrow up
    [34, 'Page<br />Down', 0, 0],
  ],
  [
    [17, 'Ctrl', 0, 0],
    [18, 'Alt', 0, 0],
    [32, '&nbsp;', 0, 0],
    [18, 'Alt', 0, 0],
    [17, 'Ctrl', 0, 0],
    [37, '', 0, 0], // Arrow left
    [40, '', 0, 0], // Arrow down
    [39, '', 0, 0], // Arrow right
  ],
];

/**
 * Map from keyCode (as string) to CSS class suffix appended to
 * `fTelnetKeyboardKey`. Lets the stylesheet target individual
 * special keys (e.g. `.fTelnetKeyboardKeyEnter`).
 */
const CLASS_KEYS: Record<string, string> = {
  '27': 'Escape',
  '36': 'HomeEndInsertDelete',
  '35': 'HomeEndInsertDelete',
  '45': 'HomeEndInsertDelete',
  '46': 'HomeEndInsertDelete',
  '8': 'Backspace',
  '9': 'Tab',
  '220': 'Backslash',
  '20': 'CapsLock',
  '13': 'Enter',
  '1004': 'ShiftLeft',
  '38': 'ArrowUp',
  '17': 'Ctrl',
  '18': 'Alt',
  '32': 'Spacebar',
  '37': 'ArrowLeft',
  '40': 'ArrowDown',
  '39': 'ArrowRight',
};

/**
 * `<f-virtual-keyboard>` — the touch-friendly on-screen keyboard.
 * Lit-component refactor of the Phase 1 `VirtualKeyboard` class.
 *
 * Properties:
 *   - `visible` (boolean, default false) — display/hide.
 *   - `vibrateDuration` (number, default 25) — milliseconds for
 *     `navigator.vibrate()` haptic feedback on supported devices
 *     (mostly Android). 0 disables haptics.
 *
 * Events:
 *   - `vk-key-down` (CustomEvent<VKKeyEventDetail>) — fired for
 *     every key activation. The detail's `{charCode, keyCode,
 *     ctrl, alt, shift}` fields match the parameter order of
 *     `Crt.PushKeyDown` so the parent can forward 1:1.
 *   - `vk-key-press` (CustomEvent<VKKeyEventDetail>) — fired for
 *     regular character keys only (skipped when Ctrl/Alt is
 *     active and for special keys). Detail shape matches
 *     `Crt.PushKeyPress`.
 *
 * Both events bubble and are composed.
 *
 * Phase 2 refactor decisions:
 *
 *   - The Phase 1 class took a `Crt` reference in its constructor
 *     and called `Crt.PushKeyDown` / `Crt.PushKeyPress` directly.
 *     The component decouples from Crt entirely — it dispatches
 *     typed events with the same data, and fTelnetClient calls
 *     Crt itself. Cleaner separation; the keyboard is now
 *     potentially reusable in non-Crt contexts.
 *
 *   - The Phase 1 listener-leak fix (bound handler instance
 *     fields) is obsolete here: Lit owns the event listeners
 *     via the `@click` / `@touchend` / `@touchstart` template
 *     bindings. Listeners go with the rendered DOM; no manual
 *     add/remove needed.
 *
 *   - The Phase 1 OnTouchStart logic (which removed click
 *     handlers after the first touch to avoid double-firing)
 *     is preserved as a runtime flag check inside the click
 *     handler. The flag flips on first `touchstart`, and the
 *     click handler bails when the flag is on. Same observable
 *     behavior, simpler implementation.
 *
 *   - The modifier-key "lit" visual state used to live in
 *     imperative `HighlightKey` calls. Now it's derived from
 *     `@state` fields in the template — Lit re-renders when the
 *     flags change. The `HighlightKey` / `ReDrawSpecialKeys`
 *     methods are gone.
 *
 *   - The Phase 1 fields used PascalCase
 *     (`VibrateDurationInMilliseconds`, `Visible`). Renamed to
 *     match the rest of the components' camelCase property
 *     convention (`vibrateDuration`, `visible`). fTelnetClient
 *     updates use the new names.
 *
 * CSS: inherits from `.fTelnetKeyboardWrapper`, `.fTelnetKeyboard`,
 * `.fTelnetKeyboardRow`, `.fTelnetKeyboardKey`, and class-suffixed
 * variants in keyboard-{size}.css. Light DOM so those selectors
 * continue to apply.
 *
 * Replaces ~535 lines of imperative class in
 * `src/ftelnetclient/VirtualKeyboard.ts` (which is deleted in
 * this delta).
 */
@customElement('f-virtual-keyboard')
export class FVirtualKeyboard extends LitElement {
  @property({ type: Boolean })
  visible = false;

  @property({ type: Number, attribute: 'vibrate-duration' })
  vibrateDuration = 25;

  // ───── Internal state (modifier latches) ─────
  // `@state` rather than `@property`: parent doesn't read these
  // and they shouldn't reflect to attributes.

  @state()
  private _altPressed = false;

  @state()
  private _capsLockEnabled = false;

  @state()
  private _ctrlPressed = false;

  @state()
  private _shiftPressed = false;

  /**
   * Flips true on the first `touchstart`. The click handler
   * checks this and bails on touch devices to prevent the
   * click + touchend double-fire that touch-event behavior
   * produces. Not reactive (no UI depends on it), so just a
   * plain field.
   */
  private _supportsTouchEvents = false;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): TemplateResult {
    const wrapperStyle = this.visible ? '' : 'display: none;';

    return html`
      <div class="fTelnetKeyboardWrapper" style=${wrapperStyle}>
        <div class="fTelnetKeyboard">
          ${ROWS.map(
            (row: KeyDef[], rowIndex: number): TemplateResult => html`
              <div
                class=${`fTelnetKeyboardRow${
                  rowIndex === 0 ? ' fTelnetKeyboardRowFunction' : ''
                }`}
              >
                ${row.map((def: KeyDef): TemplateResult => this.renderKey(def))}
              </div>
            `
          )}
        </div>
      </div>
    `;
  }

  private renderKey(def: KeyDef): TemplateResult {
    const [keyCode, label] = def;
    const suffix = CLASS_KEYS[String(keyCode)];
    const className = `fTelnetKeyboardKey${suffix ? ` fTelnetKeyboardKey${suffix}` : ''}`;

    // Modifier "lit" visual: bright green text when the
    // corresponding modifier is active. Maps to the four keys
    // ALT, CONTROL, SHIFTLEFT, CAPS_LOCK.
    const lit =
      (keyCode === KeyboardKeys.ALTERNATE && this._altPressed) ||
      (keyCode === KeyboardKeys.CONTROL && this._ctrlPressed) ||
      (keyCode === KeyboardKeys.SHIFTLEFT && this._shiftPressed) ||
      (keyCode === KeyboardKeys.CAPS_LOCK && this._capsLockEnabled);

    const inlineStyle = lit ? 'color: #00ff00;' : nothing;

    return html`
      <div
        class=${className}
        data-keycode=${keyCode}
        style=${inlineStyle}
        .innerHTML=${label}
        @click=${this.handleClick}
        @touchend=${this.handleTouchEnd}
        @touchstart=${this.handleTouchStart}
      ></div>
    `;
  }

  /**
   * Click handler. Bails if the keyboard has switched to touch
   * mode (first touchstart flips `_supportsTouchEvents`),
   * because the touchend handler is the canonical activator on
   * touch devices and we don't want to double-fire.
   */
  private handleClick = (e: Event): void => {
    if (this._supportsTouchEvents) {
      return;
    }
    this.handleKey(e);
  };

  /**
   * Touchend handler — always activates, regardless of the
   * touch-mode flag.
   */
  private handleTouchEnd = (e: Event): void => {
    this.handleKey(e);
  };

  /**
   * Touchstart handler. Flips the touch-mode flag on first
   * invocation so subsequent clicks are suppressed.
   */
  private handleTouchStart = (): void => {
    this._supportsTouchEvents = true;
  };

  /**
   * Activate a key. Routes to char-code or key-code path based
   * on whether the key is a character or special key (the
   * `charCodeShifted` field is non-zero for character keys).
   */
  private handleKey(e: Event): void {
    const keyCodeAttr = (e.target as HTMLDivElement).getAttribute('data-keycode');
    if (keyCodeAttr === null) {
      return;
    }
    const keyCode = parseInt(keyCodeAttr, 10);
    const def = this.findKeyDef(keyCode);
    if (def === undefined) {
      return;
    }

    if (def[2] > 0) {
      // Character key
      this.activateCharKey(keyCode, def);
    } else {
      // Special key (Enter, F1-12, arrows, modifiers, etc.)
      this.activateSpecialKey(keyCode);
    }
  }

  /**
   * Locate a key definition by keyCode. Linear-scans ROWS rather
   * than building an index — the search space is small
   * (~80 keys) and only happens on user clicks.
   *
   * Note: some keyCodes appear in multiple rows (Ctrl and Alt
   * appear twice in row 6 for the dual-modifier layout). Both
   * occurrences have identical KeyDefs, so returning the first
   * match is correct.
   */
  private findKeyDef(keyCode: number): KeyDef | undefined {
    for (const row of ROWS) {
      for (const def of row) {
        if (def[0] === keyCode) {
          return def;
        }
      }
    }
    return undefined;
  }

  /**
   * Handle activation of a character key:
   *   - Pick shifted vs. normal char code based on shift/capslock
   *   - Always dispatch vk-key-down
   *   - Dispatch vk-key-press only when no Ctrl/Alt modifier
   *   - Reset modifier latches afterward
   *   - Haptic feedback
   */
  private activateCharKey(keyCode: number, def: KeyDef): void {
    let charCode: number;
    if (keyCode >= 65 && keyCode <= 90) {
      // Alphanumeric: shift XOR capslock picks shifted vs normal.
      charCode = this._shiftPressed !== this._capsLockEnabled ? def[2] : def[3];
    } else {
      // Other character keys: shift alone picks the variant.
      charCode = this._shiftPressed ? def[2] : def[3];
    }

    const regularKey = !this._altPressed && !this._ctrlPressed;
    const needReset = this._altPressed || this._ctrlPressed || this._shiftPressed;

    // Snapshot modifier state for the events (we reset below).
    const ctrl = this._ctrlPressed;
    const alt = this._altPressed;
    const shift = this._shiftPressed;

    // Always dispatch keydown; only dispatch keypress for
    // regular (non-modified) keystrokes — matches browser
    // semantics.
    this.dispatchKeyEvent('vk-key-down', { charCode: 0, keyCode, ctrl, alt, shift });
    if (regularKey) {
      this.dispatchKeyEvent('vk-key-press', { charCode, keyCode: 0, ctrl, alt, shift });
    }

    this.vibrate();

    if (needReset) {
      this._altPressed = false;
      this._ctrlPressed = false;
      this._shiftPressed = false;
    }
  }

  /**
   * Handle activation of a special key. Modifiers toggle their
   * latch state; everything else dispatches a keydown and
   * resets the modifier latches.
   */
  private activateSpecialKey(keyCode: number): void {
    let needReset = false;
    switch (keyCode) {
      case KeyboardKeys.ALTERNATE:
        this._altPressed = !this._altPressed;
        break;
      case KeyboardKeys.CAPS_LOCK:
        this._capsLockEnabled = !this._capsLockEnabled;
        break;
      case KeyboardKeys.CONTROL:
        this._ctrlPressed = !this._ctrlPressed;
        break;
      case KeyboardKeys.SHIFTLEFT:
        this._shiftPressed = !this._shiftPressed;
        break;
      default:
        needReset = true;
        break;
    }

    this.dispatchKeyEvent('vk-key-down', {
      charCode: 0,
      keyCode,
      ctrl: this._ctrlPressed,
      alt: this._altPressed,
      shift: this._shiftPressed,
    });

    this.vibrate();

    if (needReset) {
      this._altPressed = false;
      this._ctrlPressed = false;
      this._shiftPressed = false;
    }
  }

  private dispatchKeyEvent(eventName: string, detail: VKKeyEventDetail): void {
    this.dispatchEvent(
      new CustomEvent<VKKeyEventDetail>(eventName, {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  /**
   * Trigger haptic feedback. Preserved verbatim from the
   * original's `typeof navigator.vibrate === 'function'`
   * check — some browsers (Firefox desktop, Safari) don't
   * expose `navigator.vibrate`, so we test before calling.
   */
  private vibrate(): void {
    if (typeof navigator.vibrate === 'function' && this.vibrateDuration > 0) {
      navigator.vibrate(this.vibrateDuration);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'f-virtual-keyboard': FVirtualKeyboard;
  }
}
