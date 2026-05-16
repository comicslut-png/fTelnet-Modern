import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@components/FStatusBar.js';
import type { FStatusBar, MenuClickDetail } from '@components/index.js';

/*
  Tests for <f-status-bar>.

  Wider still than the previous components: reactive text content
  in two places (status label + connect button), reactive
  visibility for the connect button, a payload-carrying custom
  event (menu-click → MenuClickDetail), and the standard
  visibility/width pattern.
*/

describe('<f-status-bar>', () => {
  let container: HTMLDivElement;
  let el: FStatusBar;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    el = document.createElement('f-status-bar') as FStatusBar;
    container.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('default state', () => {
    it('registers as a custom element', () => {
      expect(customElements.get('f-status-bar')).toBeDefined();
    });

    it('has sensible defaults for all reactive properties', () => {
      expect(el.statusText).toBe('Not connected');
      expect(el.connectButtonText).toBe('Connect');
      expect(el.connectButtonVisible).toBe(true);
      expect(el.state).toBe('idle');
      expect(el.widthPx).toBe(0);
    });

    it('renders inner divs with the legacy CSS classes', () => {
      expect(el.querySelector('.fTelnetStatusBar')).not.toBeNull();
      expect(el.querySelector('.fTelnetMenuButton')).not.toBeNull();
      expect(el.querySelector('.fTelnetConnectButton')).not.toBeNull();
      expect(el.querySelector('.fTelnetStatusBarLabel')).not.toBeNull();
    });

    it('shows the Menu button with hardcoded text', () => {
      expect(el.querySelector('.fTelnetMenuButton')?.textContent?.trim()).toBe('Menu');
    });

    it('shows the connect button with text from connectButtonText', () => {
      expect(el.querySelector('.fTelnetConnectButton')?.textContent?.trim()).toBe('Connect');
    });

    it('shows the status text', () => {
      expect(el.querySelector('.fTelnetStatusBarLabel')?.textContent).toBe('Not connected');
    });

    it('omits inline style attribute when no width/bg are set', () => {
      const inner = el.querySelector<HTMLElement>('.fTelnetStatusBar');
      // The render emits style="" when nothing is set, which is
      // present-but-empty. Either case is fine — both mean the
      // CSS defaults apply.
      const style = inner?.getAttribute('style') ?? '';
      expect(style).toBe('');
    });
  });

  describe('statusText reactivity', () => {
    it.each([
      'Connecting to bbs.ftelnet.ca:23',
      'Connected to bbs.ftelnet.ca:23 via p-us-east.ftelnet.ca',
      'Disconnected from bbs.ftelnet.ca:23',
      'Unable to connect to bbs.ftelnet.ca:23',
    ])('updates the status label when set to %s', async (text) => {
      el.statusText = text;
      await el.updateComplete;
      expect(el.querySelector('.fTelnetStatusBarLabel')?.textContent).toBe(text);
    });
  });

  describe('connectButtonText reactivity', () => {
    it.each(['Connect', 'Reconnect', 'Retry Connection'])(
      'updates the connect button text when set to %s',
      async (text) => {
        el.connectButtonText = text;
        await el.updateComplete;
        expect(el.querySelector('.fTelnetConnectButton')?.textContent?.trim()).toBe(text);
      }
    );
  });

  describe('connectButtonVisible reactivity', () => {
    it('setting false hides the connect button via inline display:none', async () => {
      el.connectButtonVisible = false;
      await el.updateComplete;
      const btn = el.querySelector<HTMLElement>('.fTelnetConnectButton');
      expect(btn?.getAttribute('style')).toContain('display: none');
    });

    it('toggling visible removes the display:none', async () => {
      el.connectButtonVisible = false;
      await el.updateComplete;
      el.connectButtonVisible = true;
      await el.updateComplete;
      const btn = el.querySelector<HTMLElement>('.fTelnetConnectButton');
      const style = btn?.getAttribute('style') ?? '';
      expect(style).not.toContain('display: none');
    });
  });

  describe('state reactivity', () => {
    it('renders data-state="idle" by default', () => {
      const inner = el.querySelector<HTMLElement>('.fTelnetStatusBar');
      expect(inner?.getAttribute('data-state')).toBe('idle');
    });

    it('setting state="active" updates the data-state attribute', async () => {
      el.state = 'active';
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetStatusBar');
      expect(inner?.getAttribute('data-state')).toBe('active');
    });

    it('setting state="error" updates the data-state attribute', async () => {
      el.state = 'error';
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetStatusBar');
      expect(inner?.getAttribute('data-state')).toBe('error');
    });

    it('never stamps an inline background-color (CSS owns coloring)', async () => {
      el.state = 'error';
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetStatusBar');
      const style = inner?.getAttribute('style') ?? '';
      expect(style).not.toContain('background-color');
    });
  });

  describe('widthPx reactivity', () => {
    it('setting widthPx > 0 stamps an inline width', async () => {
      el.widthPx = 800;
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetStatusBar');
      expect(inner?.getAttribute('style')).toContain('width: 800px');
    });

    it('width works in error state without affecting background', async () => {
      el.widthPx = 640;
      el.state = 'error';
      await el.updateComplete;
      const inner = el.querySelector('.fTelnetStatusBar');
      const style = inner?.getAttribute('style') ?? '';
      expect(style).toContain('width: 640px');
      expect(style).not.toContain('background-color');
      expect(inner?.getAttribute('data-state')).toBe('error');
    });
  });

  describe('menu-click event', () => {
    it('fires when Menu button is clicked', () => {
      let fired = 0;
      el.addEventListener('menu-click', () => fired++);
      el.querySelector<HTMLAnchorElement>('.fTelnetMenuButton')!.click();
      expect(fired).toBe(1);
    });

    it('carries MenuClickDetail with pageX/pageY from the click', () => {
      let captured: MenuClickDetail | undefined;
      el.addEventListener('menu-click', (e): void => {
        captured = (e as CustomEvent<MenuClickDetail>).detail;
      });

      // dispatchEvent rather than .click() so we control coordinates.
      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 123,
        clientY: 456,
      });
      // jsdom doesn't populate pageX/pageY from a MouseEvent constructor
      // automatically (they're computed properties), but it does mirror
      // clientX/clientY in the absence of scroll. Either way we just
      // need *some* coordinate to exist on the event so our handler
      // reads non-undefined values. The presence of pageX/pageY in
      // detail is what we're really verifying.
      el.querySelector<HTMLAnchorElement>('.fTelnetMenuButton')!.dispatchEvent(click);

      expect(captured).toBeDefined();
      expect(typeof captured?.pageX).toBe('number');
      expect(typeof captured?.pageY).toBe('number');
    });

    it('calls preventDefault on the click so href="#" does not navigate', () => {
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      el.querySelector<HTMLAnchorElement>('.fTelnetMenuButton')!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
    });

    it('event has bubbles=true and composed=true', () => {
      let captured: Event | undefined;
      el.addEventListener('menu-click', (e) => {
        captured = e;
      });
      el.querySelector<HTMLAnchorElement>('.fTelnetMenuButton')!.click();
      expect(captured?.bubbles).toBe(true);
      expect(captured?.composed).toBe(true);
    });
  });

  describe('connect-click event', () => {
    it('fires when Connect button is clicked', () => {
      let fired = 0;
      el.addEventListener('connect-click', () => fired++);
      el.querySelector<HTMLAnchorElement>('.fTelnetConnectButton')!.click();
      expect(fired).toBe(1);
    });

    it('still fires after the button text changes (Reconnect, etc.)', async () => {
      el.connectButtonText = 'Reconnect';
      await el.updateComplete;

      let fired = 0;
      el.addEventListener('connect-click', () => fired++);
      el.querySelector<HTMLAnchorElement>('.fTelnetConnectButton')!.click();
      expect(fired).toBe(1);
    });

    it('calls preventDefault', () => {
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      el.querySelector<HTMLAnchorElement>('.fTelnetConnectButton')!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
    });

    it('event has no detail and is bubbles=true, composed=true', () => {
      let captured: CustomEvent | undefined;
      el.addEventListener('connect-click', (e) => {
        captured = e as CustomEvent;
      });
      el.querySelector<HTMLAnchorElement>('.fTelnetConnectButton')!.click();
      expect(captured?.bubbles).toBe(true);
      expect(captured?.composed).toBe(true);
      expect(captured?.detail).toBeNull();
    });
  });

  describe('attribute interop', () => {
    it('the status-text attribute maps to statusText property', async () => {
      const standalone = document.createElement('f-status-bar') as FStatusBar;
      standalone.setAttribute('status-text', 'Hello world');
      container.appendChild(standalone);
      await standalone.updateComplete;
      expect(standalone.statusText).toBe('Hello world');
    });
  });

  describe('multiple instances', () => {
    it('two instances dispatch their own events independently', async () => {
      const second = document.createElement('f-status-bar') as FStatusBar;
      container.appendChild(second);
      await second.updateComplete;

      let firstMenu = 0;
      let secondMenu = 0;
      el.addEventListener('menu-click', () => firstMenu++);
      second.addEventListener('menu-click', () => secondMenu++);

      el.querySelector<HTMLAnchorElement>('.fTelnetMenuButton')!.click();
      expect(firstMenu).toBe(1);
      expect(secondMenu).toBe(0);

      second.querySelector<HTMLAnchorElement>('.fTelnetMenuButton')!.click();
      expect(firstMenu).toBe(1);
      expect(secondMenu).toBe(1);
    });
  });
});
