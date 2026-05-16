import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@components/FScrollbackBar.js';
import type { FScrollbackBar } from '@components/index.js';

/*
  Tests for <f-scrollback-bar>.

  Wider surface than FFocusWarning: two render modes (classic /
  modern), five custom events (one per button in classic mode),
  plus the same visibility + width controls.

  Pattern follows FFocusWarning's: detached container, await
  updateComplete after each property change, assert DOM and event
  state with native APIs.
*/

describe('<f-scrollback-bar>', () => {
  let container: HTMLDivElement;
  let el: FScrollbackBar;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    el = document.createElement('f-scrollback-bar') as FScrollbackBar;
    container.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('default state', () => {
    it('registers as a custom element', () => {
      expect(customElements.get('f-scrollback-bar')).toBeDefined();
    });

    it('starts in classic mode, hidden, no width', () => {
      expect(el.mode).toBe('classic');
      expect(el.visible).toBe(false);
      expect(el.widthPx).toBe(0);
    });

    it('renders an inner div with the legacy CSS class', () => {
      expect(el.querySelector('.fTelnetScrollback')).not.toBeNull();
    });

    it('is hidden by default (display: none in inline style)', () => {
      const inner = el.querySelector<HTMLElement>('.fTelnetScrollback');
      expect(inner?.getAttribute('style') ?? '').toContain('display: none');
    });
  });

  describe('classic mode', () => {
    it('renders the SCROLLBACK label and five action links', () => {
      const inner = el.querySelector('.fTelnetScrollback');
      const label = inner?.querySelector('span');
      expect(label?.textContent).toBe('SCROLLBACK:');

      const links = inner?.querySelectorAll('a');
      expect(links?.length).toBe(5);

      const labels = Array.from(links ?? []).map((a) => a.textContent?.trim());
      expect(labels).toEqual(['Line Up', 'Line Down', 'Page Up', 'Page Down', 'Exit']);
    });

    it.each([
      ['Line Up', 'scrollback-line-up'],
      ['Line Down', 'scrollback-line-down'],
      ['Page Up', 'scrollback-page-up'],
      ['Page Down', 'scrollback-page-down'],
      ['Exit', 'scrollback-exit'],
    ])('clicking "%s" dispatches %s', async (linkLabel, eventName) => {
      const links = Array.from(el.querySelectorAll('a'));
      const link = links.find((a) => a.textContent?.trim() === linkLabel);
      expect(link).toBeDefined();

      let fired = 0;
      el.addEventListener(eventName, () => {
        fired++;
      });

      link!.click();
      expect(fired).toBe(1);
    });

    it('click events have bubbles=true and composed=true', async () => {
      const link = el.querySelector<HTMLAnchorElement>('a');
      let captured: Event | undefined;
      el.addEventListener('scrollback-line-up', (e) => {
        captured = e;
      });
      link!.click();
      expect(captured?.bubbles).toBe(true);
      expect(captured?.composed).toBe(true);
    });

    it('clicking a link calls preventDefault so the href="#" does not navigate', () => {
      const link = el.querySelector<HTMLAnchorElement>('a');
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      link!.dispatchEvent(clickEvent);
      expect(clickEvent.defaultPrevented).toBe(true);
    });
  });

  describe('modern mode', () => {
    beforeEach(async () => {
      el.mode = 'modern';
      await el.updateComplete;
    });

    it('renders the scroll-to-exit message, no buttons', () => {
      const inner = el.querySelector('.fTelnetScrollback');
      expect(inner?.textContent).toContain('SCROLLBACK:');
      expect(inner?.textContent).toContain('Scroll back down');
      expect(inner?.querySelectorAll('a').length).toBe(0);
    });
  });

  describe('mode switching', () => {
    it('switching from classic to modern removes the buttons', async () => {
      expect(el.querySelectorAll('a').length).toBe(5);

      el.mode = 'modern';
      await el.updateComplete;

      expect(el.querySelectorAll('a').length).toBe(0);
    });

    it('switching from modern back to classic re-renders the buttons', async () => {
      el.mode = 'modern';
      await el.updateComplete;
      expect(el.querySelectorAll('a').length).toBe(0);

      el.mode = 'classic';
      await el.updateComplete;
      expect(el.querySelectorAll('a').length).toBe(5);
    });
  });

  describe('visibility reactivity', () => {
    it('setting visible=true removes display:none', async () => {
      el.visible = true;
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetScrollback');
      const style = inner?.getAttribute('style') ?? '';
      expect(style).not.toContain('display: none');
    });

    it('toggling visible works in both modes', async () => {
      el.visible = true;
      await el.updateComplete;
      let style = el.querySelector('.fTelnetScrollback')?.getAttribute('style') ?? '';
      expect(style).not.toContain('display: none');

      el.mode = 'modern';
      el.visible = false;
      await el.updateComplete;
      style = el.querySelector('.fTelnetScrollback')?.getAttribute('style') ?? '';
      expect(style).toContain('display: none');
    });
  });

  describe('widthPx reactivity', () => {
    it('setting widthPx > 0 stamps an inline width', async () => {
      el.widthPx = 800;
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetScrollback');
      expect(inner?.getAttribute('style') ?? '').toContain('width: 800px');
    });

    it('width + hidden state combine into one style attribute', async () => {
      el.widthPx = 640;
      el.visible = false;
      await el.updateComplete;
      const style = el.querySelector('.fTelnetScrollback')?.getAttribute('style') ?? '';
      expect(style).toContain('width: 640px');
      expect(style).toContain('display: none');
    });

    it('width follows mode changes', async () => {
      el.widthPx = 800;
      el.mode = 'modern';
      await el.updateComplete;
      const style = el.querySelector('.fTelnetScrollback')?.getAttribute('style') ?? '';
      expect(style).toContain('width: 800px');
    });
  });

  describe('attribute interop', () => {
    it('the mode attribute maps to the mode property', async () => {
      const standalone = document.createElement('f-scrollback-bar') as FScrollbackBar;
      standalone.setAttribute('mode', 'modern');
      container.appendChild(standalone);
      await standalone.updateComplete;
      expect(standalone.mode).toBe('modern');
    });
  });

  describe('multiple instances', () => {
    it('two instances each have their own buttons and emit their own events', async () => {
      const second = document.createElement('f-scrollback-bar') as FScrollbackBar;
      container.appendChild(second);
      await second.updateComplete;

      let firedFirst = 0;
      let firedSecond = 0;
      el.addEventListener('scrollback-line-up', () => firedFirst++);
      second.addEventListener('scrollback-line-up', () => firedSecond++);

      const firstLinks = Array.from(el.querySelectorAll('a'));
      const secondLinks = Array.from(second.querySelectorAll('a'));

      firstLinks[0]!.click();
      expect(firedFirst).toBe(1);
      expect(firedSecond).toBe(0);

      secondLinks[0]!.click();
      expect(firedFirst).toBe(1);
      expect(firedSecond).toBe(1);
    });
  });
});
