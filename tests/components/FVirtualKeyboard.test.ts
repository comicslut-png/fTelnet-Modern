import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@components/FVirtualKeyboard.js';
import type { FVirtualKeyboard, VKKeyEventDetail } from '@components/index.js';
import { KeyboardKeys } from '@crt/index.js';

/*
  Tests for <f-virtual-keyboard>.

  Biggest behavioral surface of any component:
    - Property/state defaults
    - Character key activation with all four modifier combinations
    - Modifier-key latching (Shift / Ctrl / Alt / CapsLock)
    - Modifier-key visual ("lit" class on active modifiers)
    - Modifier reset after character key activation
    - Special-key activation (Enter, F1-F12, arrows, Tab, etc.)
    - Event payload shape matches Crt.PushKeyDown/PushKeyPress params
    - Touch-mode flag suppresses click handler
    - Multi-instance independence

  ~30 tests organized by behavior cluster.
*/

describe('<f-virtual-keyboard>', () => {
  let container: HTMLDivElement;
  let el: FVirtualKeyboard;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    el = document.createElement('f-virtual-keyboard') as FVirtualKeyboard;
    container.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  /**
   * Find a key element by its data-keycode attribute. Returns
   * the first match; some keyCodes appear in multiple rows
   * (e.g. Shift exists once, but Ctrl/Alt each appear twice in
   * row 6).
   */
  function findKey(keyCode: number): HTMLElement | null {
    return el.querySelector<HTMLElement>(`[data-keycode="${keyCode}"]`);
  }

  /** Dispatch a synthetic click event on a key. */
  function clickKey(keyCode: number): void {
    findKey(keyCode)!.click();
  }

  // ───────────────────────────────────────────────────────────
  // Defaults
  // ───────────────────────────────────────────────────────────

  describe('default state', () => {
    it('registers as a custom element', () => {
      expect(customElements.get('f-virtual-keyboard')).toBeDefined();
    });

    it('starts hidden by default (display: none inline)', () => {
      const wrapper = el.querySelector<HTMLElement>('.fTelnetKeyboardWrapper');
      expect(wrapper?.getAttribute('style')).toContain('display: none');
    });

    it('exposes visible=false and vibrateDuration=25 as defaults', () => {
      expect(el.visible).toBe(false);
      expect(el.vibrateDuration).toBe(25);
    });

    it('renders six rows', () => {
      expect(el.querySelectorAll('.fTelnetKeyboardRow').length).toBe(6);
    });

    it('first row is marked as the function-key row', () => {
      const rows = el.querySelectorAll<HTMLElement>('.fTelnetKeyboardRow');
      expect(rows[0]?.classList.contains('fTelnetKeyboardRowFunction')).toBe(true);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]?.classList.contains('fTelnetKeyboardRowFunction')).toBe(false);
      }
    });

    it('renders the expected key counts per row', () => {
      const rows = el.querySelectorAll<HTMLElement>('.fTelnetKeyboardRow');
      // 17, 14, 14, 13, 14, 8 — matches the Phase 1 / original
      // layout exactly.
      const expectedCounts = [17, 14, 14, 13, 14, 8];
      rows.forEach((row, i) => {
        const count = row.querySelectorAll('.fTelnetKeyboardKey').length;
        expect(count).toBe(expectedCounts[i]);
      });
    });
  });

  // ───────────────────────────────────────────────────────────
  // Visibility
  // ───────────────────────────────────────────────────────────

  describe('visibility', () => {
    it('setting visible=true removes display:none', async () => {
      el.visible = true;
      await el.updateComplete;
      const wrapper = el.querySelector<HTMLElement>('.fTelnetKeyboardWrapper');
      expect(wrapper?.getAttribute('style') ?? '').not.toContain('display: none');
    });

    it('toggling visible flips the inline style', async () => {
      el.visible = true;
      await el.updateComplete;
      el.visible = false;
      await el.updateComplete;
      const wrapper = el.querySelector<HTMLElement>('.fTelnetKeyboardWrapper');
      expect(wrapper?.getAttribute('style')).toContain('display: none');
    });
  });

  // ───────────────────────────────────────────────────────────
  // Character keys (the unmodified path)
  // ───────────────────────────────────────────────────────────

  describe('regular character keys', () => {
    it('clicking "a" (keyCode 65) dispatches vk-key-down with keyCode=65 and vk-key-press with charCode=97', () => {
      const downs: VKKeyEventDetail[] = [];
      const presses: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-down', (e) =>
        downs.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );
      el.addEventListener('vk-key-press', (e) =>
        presses.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      clickKey(65); // 'a' or 'A' key

      expect(downs.length).toBe(1);
      expect(downs[0]).toEqual({
        charCode: 0,
        keyCode: 65,
        ctrl: false,
        alt: false,
        shift: false,
      });
      expect(presses.length).toBe(1);
      expect(presses[0]).toEqual({
        charCode: 97, // lowercase 'a' since no shift/capslock
        keyCode: 0,
        ctrl: false,
        alt: false,
        shift: false,
      });
    });

    it('clicking a digit "1" dispatches the digit charCode (49)', () => {
      const presses: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-press', (e) =>
        presses.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      clickKey(49); // '1' key
      expect(presses[0]?.charCode).toBe(49);
    });

    it('events bubble and are composed', () => {
      let captured: CustomEvent | undefined;
      el.addEventListener('vk-key-down', (e) => {
        captured = e as CustomEvent;
      });
      clickKey(65);
      expect(captured?.bubbles).toBe(true);
      expect(captured?.composed).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────
  // Modifier latching
  // ───────────────────────────────────────────────────────────

  describe('Shift modifier', () => {
    it('clicking Shift toggles _shiftPressed; modifier key lights up green', async () => {
      const shiftKey = findKey(KeyboardKeys.SHIFTLEFT);
      shiftKey!.click();
      await el.updateComplete;

      expect(shiftKey?.getAttribute('style')).toContain('color: #00ff00');
    });

    it('clicking Shift twice unlights it', async () => {
      const shiftKey = findKey(KeyboardKeys.SHIFTLEFT);
      shiftKey!.click();
      await el.updateComplete;
      shiftKey!.click();
      await el.updateComplete;

      expect(shiftKey?.getAttribute('style') ?? '').not.toContain('color: #00ff00');
    });

    it('clicking Shift then "a" dispatches uppercase A (charCode 65)', async () => {
      findKey(KeyboardKeys.SHIFTLEFT)!.click();
      await el.updateComplete;

      const presses: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-press', (e) =>
        presses.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      clickKey(65);
      expect(presses[0]?.charCode).toBe(65); // uppercase 'A'
      expect(presses[0]?.shift).toBe(true);
    });

    it('shift latch resets after one character key', async () => {
      findKey(KeyboardKeys.SHIFTLEFT)!.click();
      await el.updateComplete;
      clickKey(65); // 'A' (shifted)
      await el.updateComplete;

      const presses: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-press', (e) =>
        presses.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      clickKey(66); // 'b' (unshifted now)
      expect(presses[0]?.charCode).toBe(98); // lowercase 'b'
      expect(presses[0]?.shift).toBe(false);
    });
  });

  describe('CapsLock modifier', () => {
    it('CapsLock latches without resetting after a character key', async () => {
      findKey(KeyboardKeys.CAPS_LOCK)!.click();
      await el.updateComplete;
      clickKey(65); // 'A'
      await el.updateComplete;

      const presses: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-press', (e) =>
        presses.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      clickKey(66); // should still be uppercase
      expect(presses[0]?.charCode).toBe(66); // uppercase 'B'
    });

    it('CapsLock XOR Shift: shifted while capslocked gives lowercase', async () => {
      findKey(KeyboardKeys.CAPS_LOCK)!.click();
      await el.updateComplete;
      findKey(KeyboardKeys.SHIFTLEFT)!.click();
      await el.updateComplete;

      const presses: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-press', (e) =>
        presses.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      clickKey(65);
      // capslock=true, shift=true → XOR is false → use normal (lowercase)
      expect(presses[0]?.charCode).toBe(97);
    });

    it('CapsLock does not affect non-alphabetic keys', async () => {
      findKey(KeyboardKeys.CAPS_LOCK)!.click();
      await el.updateComplete;

      const presses: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-press', (e) =>
        presses.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      clickKey(49); // '1' key
      expect(presses[0]?.charCode).toBe(49); // unchanged
    });
  });

  describe('Ctrl modifier', () => {
    it('Ctrl + character: dispatches keydown only, no keypress', async () => {
      findKey(KeyboardKeys.CONTROL)!.click();
      await el.updateComplete;

      const downs: VKKeyEventDetail[] = [];
      const presses: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-down', (e) =>
        downs.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );
      el.addEventListener('vk-key-press', (e) =>
        presses.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      clickKey(67); // Ctrl+C
      expect(downs.length).toBe(1);
      expect(downs[0]?.ctrl).toBe(true);
      expect(presses.length).toBe(0); // suppressed
    });

    it('Ctrl latch resets after one character key', async () => {
      findKey(KeyboardKeys.CONTROL)!.click();
      await el.updateComplete;
      clickKey(67); // Ctrl+C
      await el.updateComplete;

      const downs: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-down', (e) =>
        downs.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      clickKey(68); // 'd' (no modifier)
      expect(downs[0]?.ctrl).toBe(false);
    });
  });

  describe('Alt modifier', () => {
    it('Alt + character: dispatches keydown only', async () => {
      findKey(KeyboardKeys.ALTERNATE)!.click();
      await el.updateComplete;

      const downs: VKKeyEventDetail[] = [];
      const presses: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-down', (e) =>
        downs.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );
      el.addEventListener('vk-key-press', (e) =>
        presses.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      clickKey(65);
      expect(downs[0]?.alt).toBe(true);
      expect(presses.length).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────
  // Special keys (no character payload)
  // ───────────────────────────────────────────────────────────

  describe('special keys', () => {
    it.each([
      ['Enter', 13],
      ['Tab', 9],
      ['Backspace', 8],
      ['Escape', 27],
      ['F1', 112],
      ['F12', 123],
      ['Home', 36],
      ['End', 35],
      ['Arrow Up', 38],
      ['Arrow Down', 40],
      ['Arrow Left', 37],
      ['Arrow Right', 39],
    ])('clicking %s dispatches vk-key-down with keyCode=%d, no vk-key-press', (_, keyCode) => {
      const downs: VKKeyEventDetail[] = [];
      const presses: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-down', (e) =>
        downs.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );
      el.addEventListener('vk-key-press', (e) =>
        presses.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      clickKey(keyCode);
      expect(downs.length).toBe(1);
      expect(downs[0]?.keyCode).toBe(keyCode);
      expect(downs[0]?.charCode).toBe(0);
      expect(presses.length).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────
  // Touch-mode flag
  // ───────────────────────────────────────────────────────────

  describe('touch handling', () => {
    it('touchstart on any key flips the touch-mode flag', () => {
      const key = findKey(65)!;
      const downs: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-down', (e) =>
        downs.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      key.dispatchEvent(new Event('touchstart'));
      key.click();
      expect(downs.length).toBe(0); // click suppressed
    });

    it('touchend dispatches the key like a click would', () => {
      const key = findKey(65)!;
      const downs: VKKeyEventDetail[] = [];
      const presses: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-down', (e) =>
        downs.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );
      el.addEventListener('vk-key-press', (e) =>
        presses.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      // touchend's target should be the key element. Build the
      // event manually to ensure that.
      const evt = new Event('touchend', { bubbles: true });
      key.dispatchEvent(evt);

      expect(downs.length).toBe(1);
      expect(presses.length).toBe(1);
    });

    it('after touch mode is on, clicks remain suppressed', () => {
      const key = findKey(65)!;
      key.dispatchEvent(new Event('touchstart'));
      key.click();
      key.click();
      key.click();

      const downs: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-down', (e) =>
        downs.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      key.click();
      expect(downs.length).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────
  // Attribute interop
  // ───────────────────────────────────────────────────────────

  describe('attribute interop', () => {
    it('the vibrate-duration attribute maps to vibrateDuration property', async () => {
      const standalone = document.createElement('f-virtual-keyboard') as FVirtualKeyboard;
      standalone.setAttribute('vibrate-duration', '50');
      container.appendChild(standalone);
      await standalone.updateComplete;
      expect(standalone.vibrateDuration).toBe(50);
    });

    it('the visible attribute (boolean) maps to visible property', async () => {
      const standalone = document.createElement('f-virtual-keyboard') as FVirtualKeyboard;
      standalone.setAttribute('visible', '');
      container.appendChild(standalone);
      await standalone.updateComplete;
      expect(standalone.visible).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────
  // Multi-instance
  // ───────────────────────────────────────────────────────────

  describe('multiple instances', () => {
    it('two keyboards have independent modifier state', async () => {
      const second = document.createElement('f-virtual-keyboard') as FVirtualKeyboard;
      container.appendChild(second);
      await second.updateComplete;

      // Latch Shift on the first
      el.querySelector<HTMLElement>(`[data-keycode="${KeyboardKeys.SHIFTLEFT}"]`)!.click();
      await el.updateComplete;

      const firstPresses: VKKeyEventDetail[] = [];
      const secondPresses: VKKeyEventDetail[] = [];
      el.addEventListener('vk-key-press', (e) =>
        firstPresses.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );
      second.addEventListener('vk-key-press', (e) =>
        secondPresses.push((e as CustomEvent<VKKeyEventDetail>).detail)
      );

      el.querySelector<HTMLElement>('[data-keycode="65"]')!.click();
      second.querySelector<HTMLElement>('[data-keycode="65"]')!.click();

      expect(firstPresses[0]?.shift).toBe(true);
      expect(firstPresses[0]?.charCode).toBe(65); // uppercase
      expect(secondPresses[0]?.shift).toBe(false);
      expect(secondPresses[0]?.charCode).toBe(97); // lowercase
    });
  });
});
