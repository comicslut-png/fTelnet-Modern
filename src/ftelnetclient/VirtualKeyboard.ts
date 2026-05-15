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

import { Crt, KeyboardKeys } from '../crt/index.js';

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
 * Touch-friendly on-screen keyboard.
 *
 * Built as a tree of `<div>`s in a wrapper. Each key registers a
 * click handler that synthesizes keypress events on the supplied
 * Crt. Touch devices upgrade to touchstart/touchend handlers and
 * skip the click handlers to avoid double-firing.
 *
 * Phase 1 migration notes:
 *
 *   - The original had a TODOX about RemoveEventListeners at the
 *     top of the file. The `OnTouchStart` method has the same
 *     listener-leak bug as RIP.ts had: `addEventListener` is called
 *     with arrow-function wrappers (fresh function objects each
 *     time), and `removeEventListener` is called with the raw
 *     method references (different function objects). The
 *     `removeEventListener` calls silently do nothing.
 *
 *     Fix: store bound handlers as instance fields and use those
 *     references for both add and remove. A test asserts the
 *     references are stable.
 *
 *   - `_Keys: any[]` and `_Rows: any[]` typed properly as
 *     `Array<KeyDef>` and `Array<Array<KeyDef>>`. The `_Keys` array
 *     is sparsely populated, indexed by keyCode (e.g. `_Keys[13]`
 *     is the Enter key). That works but it's confusing typing in
 *     the original; documented here.
 *
 *   - `_ClassKeys: any` typed as `Record<string, string>` — it's a
 *     map from numeric key code (as string) to CSS class suffix.
 *
 *   - `var` → `let`/`const` throughout.
 *
 *   - The vibrate guard `if (!!navigator.vibrate && (this._VibrateDurationInMilliseconds > 0))`
 *     is preserved exactly. Note that some browsers (Firefox on
 *     desktop, Safari) don't expose `navigator.vibrate`; the `!!`
 *     coerces the missing case to false.
 */
export class VirtualKeyboard {
  // ───── State ─────
  private _AltPressed = false;
  private _CapsLockEnabled = false;
  private readonly _Crt: Crt;
  private _CtrlPressed = false;
  private _Div!: HTMLDivElement; // assigned in CreateDivElement, called from ctor
  private _ShiftPressed = false;
  private _SupportsTouchEvents = false;
  private _VibrateDurationInMilliseconds = 25;
  private _Visible = true;

  /** Map from keyCode (as string) to CSS class suffix appended to "fTelnetKeyboardKey". */
  private readonly _ClassKeys: Record<string, string> = {
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
   * Sparse array indexed by keyCode. Used by `OnCharCode` and
   * `OnTouchStart` to look up a key's full definition from the
   * `data-keycode` attribute on the clicked element.
   */
  private readonly _Keys: KeyDef[] = [];

  // ───── Bound event handlers (see "listener leak" note above) ─────
  private readonly _onClickChar: (e: Event) => void;
  private readonly _onTouchEndChar: (e: Event) => void;
  private readonly _onClickKey: (e: Event) => void;
  private readonly _onTouchEndKey: (e: Event) => void;
  private readonly _onTouchStart: () => void;

  constructor(crt: Crt, container: HTMLElement) {
    this._Crt = crt;

    // Pre-bind handlers so add/remove listener calls see the same
    // function objects. See "listener leak" note on the class.
    this._onClickChar = (e: Event): void => {
      if (!this._SupportsTouchEvents) {
        this.OnCharCode(e);
      }
    };
    this._onTouchEndChar = (e: Event): void => this.OnCharCode(e);
    this._onClickKey = (e: Event): void => {
      if (!this._SupportsTouchEvents) {
        this.OnKeyCode(e);
      }
    };
    this._onTouchEndKey = (e: Event): void => this.OnKeyCode(e);
    this._onTouchStart = (): void => this.OnTouchStart();

    container.appendChild(this.CreateDivElement());

    // Wire click/touch events for all key divs the DOM-build step
    // generated. We do this in a second pass (after the markup is
    // attached) because querySelectorAll returns a static snapshot
    // — and we need the elements that just got built.
    const Keys = document.getElementsByClassName('fTelnetKeyboardKey') as HTMLCollectionOf<HTMLElement>;
    for (let i = 0; i < Keys.length; i++) {
      const KeyCode: string | null = Keys[i]!.getAttribute('data-keycode');
      if (KeyCode !== null) {
        const def = this._Keys[Number(KeyCode)];
        if (def !== undefined && def[2] > 0) {
          // Regular character key: shifted-char-code is non-zero.
          Keys[i]!.addEventListener('click', this._onClickChar, false);
          Keys[i]!.addEventListener('touchend', this._onTouchEndChar, false);
          Keys[i]!.addEventListener('touchstart', this._onTouchStart, false);
        } else {
          // Special key (Enter, F1-12, arrows, modifiers, etc.).
          Keys[i]!.addEventListener('click', this._onClickKey, false);
          Keys[i]!.addEventListener('touchend', this._onTouchEndKey, false);
          Keys[i]!.addEventListener('touchstart', this._onTouchStart, false);
        }
      }
    }
  }

  /**
   * Build the keyboard's DOM. Returns the wrapper div the
   * constructor then attaches to its container.
   *
   * The big `Rows` table is the layout: 6 rows of keys including
   * function row, number row, QWERTY, ASDF, ZXCV, and space/modifier
   * row. Each cell is a `KeyDef` tuple — see the type alias for the
   * field meanings.
   */
  private CreateDivElement(): HTMLDivElement {
    // Rows[Row][Key] = KeyDef = [keyCode, label, charCodeShifted, charCodeNormal]
    //
    // The big table preserved exactly from the original — every
    // keyCode, label, and char code matches. Whitespace and `<br />`
    // tags in labels are intentional (they style the dual-character
    // keys like "!<br />1" so the shifted variant sits above the
    // unshifted one).
    const Rows: KeyDef[][] = [
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

    let Html = '';
    for (let Row = 0; Row < Rows.length; Row++) {
      Html += '<div class="fTelnetKeyboardRow';
      if (Row === 0) {
        // The function-key row gets an extra class so CSS can size
        // it differently (smaller keys, since it has 17 of them).
        Html += ' fTelnetKeyboardRowFunction';
      }
      Html += '">';

      for (let i = 0; i < Rows[Row]!.length; i++) {
        const def = Rows[Row]![i]!;
        Html += '<div class="fTelnetKeyboardKey';
        if (this._ClassKeys[String(def[0])] !== undefined) {
          Html += ' fTelnetKeyboardKey' + this._ClassKeys[String(def[0])];
        }
        Html += '" data-keycode="' + def[0] + '">';
        Html += def[1];
        Html += '</div>';

        // Sparse: store the KeyDef at index keyCode so OnCharCode
        // / OnKeyCode can look it up via the data-keycode attribute.
        this._Keys[def[0]] = def;
      }

      Html += '</div>';
    }

    const ChildDiv: HTMLDivElement = document.createElement('div');
    ChildDiv.className = 'fTelnetKeyboard';
    ChildDiv.innerHTML = Html;

    this._Div = document.createElement('div');
    this._Div.className = 'fTelnetKeyboardWrapper';
    this._Div.appendChild(ChildDiv);
    this._Div.style.display = this._Visible ? 'block' : 'none';

    return this._Div;
  }

  /**
   * Toggle the lit color on all keys matching the given CSS class.
   * Used to indicate which modifier keys (Shift/Ctrl/Alt/CapsLock)
   * are currently active.
   *
   * Lit color is hard-coded to `#00ff00` (bright green); the unlit
   * state restores by removing the inline `style` attribute
   * entirely so it falls back to the class-defined colors.
   */
  private HighlightKey(className: string, lit: boolean): void {
    const Keys = document.getElementsByClassName(className) as HTMLCollectionOf<HTMLElement>;
    for (let i = 0; i < Keys.length; i++) {
      if (lit) {
        Keys[i]!.style.color = '#00ff00';
      } else {
        Keys[i]!.removeAttribute('style');
      }
    }
  }

  /**
   * Handle a click/touchend on a regular character key.
   *
   * Synthesizes a keydown event always, plus a keypress event when
   * no modifier (Ctrl/Alt) is active — matching browser keyboard
   * event semantics. Modifier state is reset after a regular
   * keypress so the user doesn't have to release them manually.
   */
  private OnCharCode(e: Event): void {
    const KeyCodeString: string | null = (e.target as HTMLDivElement).getAttribute('data-keycode');
    if (KeyCodeString !== null) {
      const KeyCode: number = parseInt(KeyCodeString, 10);
      let CharCode = 0;

      const def = this._Keys[KeyCode];
      if (def === undefined) {
        return;
      }

      if (KeyCode >= 65 && KeyCode <= 90) {
        // Alphanumeric: shift XOR capslock picks shifted vs normal.
        CharCode = this._ShiftPressed !== this._CapsLockEnabled ? def[2] : def[3];
      } else {
        // Other character keys: shift alone picks the variant.
        CharCode = this._ShiftPressed ? def[2] : def[3];
      }

      let NeedReDraw = false;
      let RegularKey = true;
      if (this._AltPressed) {
        NeedReDraw = true;
        RegularKey = false;
      }
      if (this._CtrlPressed) {
        NeedReDraw = true;
        RegularKey = false;
      }
      if (this._ShiftPressed) {
        NeedReDraw = true;
      }

      // Always dispatch keydown; only dispatch keypress for regular
      // (non-modified) keystrokes — matches browser semantics.
      this._Crt.PushKeyDown(0, KeyCode, this._CtrlPressed, this._AltPressed, this._ShiftPressed);
      if (RegularKey) {
        this._Crt.PushKeyPress(
          CharCode,
          0,
          this._CtrlPressed,
          this._AltPressed,
          this._ShiftPressed
        );
      }

      // Haptic feedback on supported devices (mostly Android).
      if (
        typeof navigator.vibrate === 'function' &&
        this._VibrateDurationInMilliseconds > 0
      ) {
        navigator.vibrate(this._VibrateDurationInMilliseconds);
      }

      if (NeedReDraw) {
        this._AltPressed = false;
        this._CtrlPressed = false;
        this._ShiftPressed = false;
        this.ReDrawSpecialKeys();
      }
    }
  }

  /**
   * Handle a click/touchend on a special (non-character) key:
   * modifiers, function keys, arrows, Tab/Enter, etc.
   *
   * Modifier keys toggle their state; everything else dispatches a
   * keydown and resets the modifier state.
   */
  private OnKeyCode(e: Event): void {
    const KeyCodeString: string | null = (e.target as HTMLDivElement).getAttribute('data-keycode');
    if (KeyCodeString !== null) {
      const KeyCode: number = parseInt(KeyCodeString, 10);

      let NeedReset = false;
      switch (KeyCode) {
        case KeyboardKeys.ALTERNATE:
          this._AltPressed = !this._AltPressed;
          this.ReDrawSpecialKeys();
          break;
        case KeyboardKeys.CAPS_LOCK:
          this._CapsLockEnabled = !this._CapsLockEnabled;
          this.ReDrawSpecialKeys();
          break;
        case KeyboardKeys.CONTROL:
          this._CtrlPressed = !this._CtrlPressed;
          this.ReDrawSpecialKeys();
          break;
        case KeyboardKeys.SHIFTLEFT:
          this._ShiftPressed = !this._ShiftPressed;
          this.ReDrawSpecialKeys();
          break;
        default:
          NeedReset = true;
          break;
      }

      this._Crt.PushKeyDown(0, KeyCode, this._CtrlPressed, this._AltPressed, this._ShiftPressed);

      if (
        typeof navigator.vibrate === 'function' &&
        this._VibrateDurationInMilliseconds > 0
      ) {
        navigator.vibrate(this._VibrateDurationInMilliseconds);
      }

      if (NeedReset) {
        this._AltPressed = false;
        this._CtrlPressed = false;
        this._ShiftPressed = false;
        this.ReDrawSpecialKeys();
      }
    }
  }

  /**
   * First touchstart event: flips us into "touch device" mode and
   * removes the click handlers so we don't double-fire (click +
   * touchend would both invoke the key handler on touch devices).
   *
   * The original had a "TODOX Can this be made to work?" comment
   * here because the `removeEventListener` calls used raw method
   * references that didn't match the arrow-function wrappers used
   * by `addEventListener`. Listeners silently failed to detach.
   *
   * Fix: in the migrated code, both add and remove use the stored
   * bound handler instance fields, so removal actually works.
   */
  private OnTouchStart(): void {
    if (this._SupportsTouchEvents) {
      // Already in touch mode — nothing more to do.
      return;
    }

    this._SupportsTouchEvents = true;

    // Unsubscribe the click handlers now that touch is confirmed.
    // The touchstart handlers themselves get removed too (we don't
    // need them after the first event flips this flag).
    const Keys = document.getElementsByClassName('fTelnetKeyboardKey') as HTMLCollectionOf<HTMLElement>;
    for (let i = 0; i < Keys.length; i++) {
      const KeyCode: string | null = Keys[i]!.getAttribute('data-keycode');
      if (KeyCode !== null) {
        const def = this._Keys[Number(KeyCode)];
        if (def !== undefined && def[2] > 0) {
          Keys[i]!.removeEventListener('click', this._onClickChar);
          Keys[i]!.removeEventListener('touchstart', this._onTouchStart, false);
        } else {
          Keys[i]!.removeEventListener('click', this._onClickKey, false);
          Keys[i]!.removeEventListener('touchstart', this._onTouchStart, false);
        }
      }
    }
  }

  /** Refresh the lit/unlit state of all four modifier-key classes. */
  private ReDrawSpecialKeys(): void {
    this.HighlightKey('fTelnetKeyboardKeyCapsLock', this._CapsLockEnabled);
    this.HighlightKey('fTelnetKeyboardKeyShiftLeft', this._ShiftPressed);
    this.HighlightKey('fTelnetKeyboardKeyCtrl', this._CtrlPressed);
    this.HighlightKey('fTelnetKeyboardKeyAlt', this._AltPressed);
  }

  // ───── Public getters/setters ─────

  public get VibrateDurationInMilliseconds(): number {
    return this._VibrateDurationInMilliseconds;
  }

  public set VibrateDurationInMilliseconds(value: number) {
    this._VibrateDurationInMilliseconds = value;
  }

  public get Visible(): boolean {
    return this._Visible;
  }

  public set Visible(value: boolean) {
    this._Visible = value;

    // `_Div` is non-null after the constructor runs, but the
    // setter could theoretically be called before that completes —
    // guard with the `typeof undefined` check the original used.
    if (typeof this._Div !== 'undefined') {
      this._Div.style.display = value ? 'block' : 'none';
    }
  }
}
