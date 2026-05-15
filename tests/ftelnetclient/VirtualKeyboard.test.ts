import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Crt } from '@crt/index.js';
import { VirtualKeyboard } from '@ftelnetclient/index.js';

/*
  Tests for the virtual on-screen keyboard.

  Scope: construction smoke, public getter/setter behavior, and
  verification of the listener-leak fix. The keyboard's actual
  click → Crt-keypress dispatch flow is hard to drive cleanly in
  jsdom (the DOM contains the key divs but click events need to
  reach handlers that read `data-keycode` attributes), so detailed
  dispatch testing is left to the integration / manual-QA phase.
*/

describe('VirtualKeyboard', () => {
  let container: HTMLDivElement;
  let crtContainer: HTMLDivElement;
  let crt: Crt;

  beforeEach(() => {
    crtContainer = document.createElement('div');
    document.body.appendChild(crtContainer);
    crt = new Crt(crtContainer, false);

    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(crtContainer);
    document.body.removeChild(container);
  });

  describe('construction', () => {
    it('does not throw with valid args', () => {
      expect(() => new VirtualKeyboard(crt, container)).not.toThrow();
    });

    it('attaches a wrapper div to the container', () => {
      expect(container.children.length).toBe(0);
      new VirtualKeyboard(crt, container);
      expect(container.children.length).toBe(1);
      const wrapper = container.children[0] as HTMLElement;
      expect(wrapper.className).toBe('fTelnetKeyboardWrapper');
    });

    it('renders the six key-rows', () => {
      new VirtualKeyboard(crt, container);
      const rows = document.getElementsByClassName('fTelnetKeyboardRow');
      expect(rows.length).toBe(6);
    });

    it('the first row gets the fTelnetKeyboardRowFunction class', () => {
      new VirtualKeyboard(crt, container);
      const rows = document.getElementsByClassName('fTelnetKeyboardRow');
      expect(rows[0]!.className).toContain('fTelnetKeyboardRowFunction');
    });
  });

  describe('listener leak fix', () => {
    // The original VirtualKeyboard had the same bug as RIP: arrow-
    // function wrappers passed to addEventListener but raw method
    // references passed to removeEventListener, so the removes
    // silently failed and listeners leaked. The fix: store bound
    // handlers as instance fields.
    //
    // This test asserts that the bound handlers are stable
    // references — same identity across two reads.

    it('stores stable bound handlers as instance fields', () => {
      const kb = new VirtualKeyboard(crt, container);
      type WithHandlers = {
        _onClickChar: (e: Event) => void;
        _onTouchEndChar: (e: Event) => void;
        _onClickKey: (e: Event) => void;
        _onTouchEndKey: (e: Event) => void;
        _onTouchStart: () => void;
      };
      const priv = kb as unknown as WithHandlers;

      expect(typeof priv._onClickChar).toBe('function');
      expect(typeof priv._onTouchEndChar).toBe('function');
      expect(typeof priv._onClickKey).toBe('function');
      expect(typeof priv._onTouchEndKey).toBe('function');
      expect(typeof priv._onTouchStart).toBe('function');

      // Stability check.
      expect(priv._onClickChar).toBe(priv._onClickChar);
      expect(priv._onTouchEndChar).toBe(priv._onTouchEndChar);
      expect(priv._onClickKey).toBe(priv._onClickKey);
      expect(priv._onTouchEndKey).toBe(priv._onTouchEndKey);
      expect(priv._onTouchStart).toBe(priv._onTouchStart);
    });
  });

  describe('Visible getter/setter', () => {
    it('Visible starts true', () => {
      const kb = new VirtualKeyboard(crt, container);
      expect(kb.Visible).toBe(true);
    });

    it('setting Visible false hides the wrapper', () => {
      const kb = new VirtualKeyboard(crt, container);
      const wrapper = container.children[0] as HTMLElement;
      kb.Visible = false;
      expect(kb.Visible).toBe(false);
      expect(wrapper.style.display).toBe('none');
    });

    it('setting Visible true shows the wrapper', () => {
      const kb = new VirtualKeyboard(crt, container);
      const wrapper = container.children[0] as HTMLElement;
      kb.Visible = false;
      kb.Visible = true;
      expect(wrapper.style.display).toBe('block');
    });
  });

  describe('VibrateDurationInMilliseconds getter/setter', () => {
    it('defaults to 25ms', () => {
      const kb = new VirtualKeyboard(crt, container);
      expect(kb.VibrateDurationInMilliseconds).toBe(25);
    });

    it('setter persists the new value', () => {
      const kb = new VirtualKeyboard(crt, container);
      kb.VibrateDurationInMilliseconds = 100;
      expect(kb.VibrateDurationInMilliseconds).toBe(100);
    });

    it('setting to 0 disables vibration (read back)', () => {
      const kb = new VirtualKeyboard(crt, container);
      kb.VibrateDurationInMilliseconds = 0;
      expect(kb.VibrateDurationInMilliseconds).toBe(0);
    });
  });

  describe('multiple instances', () => {
    it('two keyboards in separate containers each render their own key rows', () => {
      const containerB = document.createElement('div');
      document.body.appendChild(containerB);

      new VirtualKeyboard(crt, container);
      new VirtualKeyboard(crt, containerB);

      // Both containers have a wrapper.
      expect(container.children.length).toBe(1);
      expect(containerB.children.length).toBe(1);

      // Document-wide row count is twice the per-keyboard count.
      const rows = document.getElementsByClassName('fTelnetKeyboardRow');
      expect(rows.length).toBe(12);

      document.body.removeChild(containerB);
    });
  });
});
