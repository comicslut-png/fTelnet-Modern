import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@components/FMenuPopup.js';
import type {
  FMenuPopup,
  MenuActionDetail,
  MenuActionName,
  ScreenSizeChangeDetail,
} from '@components/index.js';

/*
  Tests for <f-menu-popup>.

  Biggest component test surface yet: conditional rendering for
  two rows, eight distinct menu-action dispatches, a separate
  screen-size-change event with payload, and positioning logic
  driven by pageX/pageY + clientHeight.
*/

describe('<f-menu-popup>', () => {
  let container: HTMLDivElement;
  let el: FMenuPopup;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    el = document.createElement('f-menu-popup') as FMenuPopup;
    container.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('default state', () => {
    it('registers as a custom element', () => {
      expect(customElements.get('f-menu-popup')).toBeDefined();
    });

    it('has sensible defaults for all reactive properties', () => {
      expect(el.open).toBe(false);
      expect(el.pageX).toBe(0);
      expect(el.pageY).toBe(0);
      expect(el.showCopyPaste).toBe(false);
      expect(el.showScrollback).toBe(false);
      expect(el.currentScreenSize).toBe('80x25');
      // Default supportedScreenSizes is the standard 15-entry list
      expect(el.supportedScreenSizes.length).toBe(15);
    });

    it('renders an inner div with the legacy CSS class', () => {
      expect(el.querySelector('.fTelnetMenuButtons')).not.toBeNull();
    });

    it('is hidden by default (display: none inline)', () => {
      const inner = el.querySelector<HTMLElement>('.fTelnetMenuButtons');
      expect(inner?.getAttribute('style') ?? '').toContain('display: none');
    });
  });

  describe('action buttons always present', () => {
    it.each([
      ['Connect', 'connect'],
      ['Disconnect', 'disconnect'],
      ['Keyboard', 'keyboard-toggle'],
    ])('renders the "%s" button and dispatches %s', (linkLabel, action) => {
      const links = Array.from(el.querySelectorAll('a'));
      const link = links.find((a) => a.textContent?.trim() === linkLabel);
      expect(link).toBeDefined();

      let captured: MenuActionDetail | undefined;
      el.addEventListener('menu-action', (e): void => {
        captured = (e as CustomEvent<MenuActionDetail>).detail;
      });
      link!.click();
      expect(captured?.action).toBe(action);
    });

    it('renders the Upload button with active protocol in label (default ZMODEM)', () => {
      const links = Array.from(el.querySelectorAll('a'));
      const link = links.find((a) =>
        (a.textContent ?? '').trim().startsWith('Upload'),
      );
      expect(link).toBeDefined();
      expect(link!.textContent?.trim()).toBe('Upload (ZMODEM)');

      let captured: MenuActionDetail | undefined;
      el.addEventListener('menu-action', (e): void => {
        captured = (e as CustomEvent<MenuActionDetail>).detail;
      });
      link!.click();
      expect(captured?.action).toBe('upload');
    });

    it('renders the Download button with active protocol in label (default ZMODEM)', () => {
      const links = Array.from(el.querySelectorAll('a'));
      const link = links.find((a) =>
        (a.textContent ?? '').trim().startsWith('Download'),
      );
      expect(link).toBeDefined();
      expect(link!.textContent?.trim()).toBe('Download (ZMODEM)');

      let captured: MenuActionDetail | undefined;
      el.addEventListener('menu-action', (e): void => {
        captured = (e as CustomEvent<MenuActionDetail>).detail;
      });
      link!.click();
      expect(captured?.action).toBe('download');
    });

    it('renders Upload (YMODEM) / Download (YMODEM) when transferProtocol is ymodem', async () => {
      el.transferProtocol = 'ymodem';
      await el.updateComplete;
      const links = Array.from(el.querySelectorAll('a'));
      const upload = links.find((a) =>
        (a.textContent ?? '').trim().startsWith('Upload'),
      );
      const download = links.find((a) =>
        (a.textContent ?? '').trim().startsWith('Download'),
      );
      expect(upload?.textContent?.trim()).toBe('Upload (YMODEM)');
      expect(download?.textContent?.trim()).toBe('Download (YMODEM)');
    });

    it('renders the Full Screen button (uses &nbsp; in label)', () => {
      const links = Array.from(el.querySelectorAll('a'));
      // The non-breaking space (\u00A0) comes from .innerHTML = 'Full&nbsp;Screen'
      const fullScreen = links.find((a) =>
        (a.textContent ?? '').includes('Full') && (a.textContent ?? '').includes('Screen')
      );
      expect(fullScreen).toBeDefined();

      let captured: MenuActionDetail | undefined;
      el.addEventListener('menu-action', (e): void => {
        captured = (e as CustomEvent<MenuActionDetail>).detail;
      });
      fullScreen!.click();
      expect(captured?.action).toBe('fullscreen');
    });

    it('clicks call preventDefault so href="#" does not navigate', () => {
      const link = el.querySelector<HTMLAnchorElement>('a');
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      link!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
    });

    it('menu-action events bubble and are composed', () => {
      let captured: Event | undefined;
      el.addEventListener('menu-action', (e) => {
        captured = e;
      });
      el.querySelector<HTMLAnchorElement>('a')!.click();
      expect(captured?.bubbles).toBe(true);
      expect(captured?.composed).toBe(true);
    });
  });

  describe('conditional Copy/Paste row (showCopyPaste)', () => {
    it('hidden by default', () => {
      const labels = Array.from(el.querySelectorAll('a')).map((a) => a.textContent?.trim());
      expect(labels).not.toContain('Copy');
      expect(labels).not.toContain('Paste');
    });

    it('shows Copy and Paste when showCopyPaste=true', async () => {
      el.showCopyPaste = true;
      await el.updateComplete;
      const labels = Array.from(el.querySelectorAll('a')).map((a) => a.textContent?.trim());
      expect(labels).toContain('Copy');
      expect(labels).toContain('Paste');
    });

    it.each([
      ['Copy', 'copy'],
      ['Paste', 'paste'],
    ])('dispatches %s when "%s" clicked', async (linkLabel, action) => {
      el.showCopyPaste = true;
      await el.updateComplete;

      const link = Array.from(el.querySelectorAll('a')).find(
        (a) => a.textContent?.trim() === linkLabel
      );
      let captured: MenuActionDetail | undefined;
      el.addEventListener('menu-action', (e): void => {
        captured = (e as CustomEvent<MenuActionDetail>).detail;
      });
      link!.click();
      expect(captured?.action).toBe(action);
    });
  });

  describe('conditional Scrollback row (showScrollback)', () => {
    it('hidden by default', () => {
      const labels = Array.from(el.querySelectorAll('a')).map((a) => a.textContent?.trim());
      expect(labels).not.toContain('View Scrollback Buffer');
    });

    it('shows the View Scrollback Buffer link when showScrollback=true', async () => {
      el.showScrollback = true;
      await el.updateComplete;
      const labels = Array.from(el.querySelectorAll('a')).map((a) => a.textContent?.trim());
      expect(labels).toContain('View Scrollback Buffer');
    });

    it('dispatches enter-scrollback when clicked', async () => {
      el.showScrollback = true;
      await el.updateComplete;
      const link = Array.from(el.querySelectorAll('a')).find(
        (a) => a.textContent?.trim() === 'View Scrollback Buffer'
      );

      let captured: MenuActionDetail | undefined;
      el.addEventListener('menu-action', (e): void => {
        captured = (e as CustomEvent<MenuActionDetail>).detail;
      });
      link!.click();
      expect(captured?.action).toBe('enter-scrollback');
    });
  });

  describe('open / position', () => {
    it('sets display: block when open=true', async () => {
      el.open = true;
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetMenuButtons');
      const style = inner?.getAttribute('style') ?? '';
      expect(style).toContain('display: block');
      expect(style).not.toContain('display: none');
    });

    it('sets left from pageX when open', async () => {
      el.open = true;
      el.pageX = 250;
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetMenuButtons');
      expect(inner?.getAttribute('style') ?? '').toContain('left: 250px');
    });

    it('positions top at click point with translateY(-100%) for above-anchoring', async () => {
      // Phase 5 polish: positioning model uses
      // `top: pageY; transform: translateY(-100%)` instead of
      // the old `top: pageY - clientHeight`. The CSS transform
      // shifts the popup up by its own measured height at paint
      // time, so it works on first render without needing a JS
      // measurement pass.
      el.open = true;
      el.pageY = 500;
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetMenuButtons');
      const style = inner?.getAttribute('style') ?? '';
      expect(style).toContain('position: fixed');
      expect(style).toContain('top: 500px');
      expect(style).toContain('translateY(-100%)');
    });

    it('omits left/top when closed', async () => {
      el.open = false;
      el.pageX = 250;
      el.pageY = 500;
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetMenuButtons');
      const style = inner?.getAttribute('style') ?? '';
      expect(style).not.toContain('left:');
      expect(style).not.toContain('top:');
    });
  });

  describe('click-outside-to-close', () => {
    it('clicking outside the popup closes it', async () => {
      el.open = true;
      await el.updateComplete;
      // Wait a microtask so the outside-click listener attaches
      // (it's deferred via queueMicrotask in updated()).
      await Promise.resolve();

      // Simulate a click on document.body (outside the popup).
      const event = new MouseEvent('mousedown', { bubbles: true });
      document.body.dispatchEvent(event);

      expect(el.open).toBe(false);
    });

    it('clicking inside the popup does not close it', async () => {
      el.open = true;
      await el.updateComplete;
      await Promise.resolve();

      // Click on an element inside the popup.
      const inner = el.querySelector<HTMLElement>('.fTelnetMenuButtons');
      const event = new MouseEvent('mousedown', { bubbles: true });
      inner?.dispatchEvent(event);

      expect(el.open).toBe(true);
    });

    it('dispatches menu-close event when closed by outside click', async () => {
      el.open = true;
      await el.updateComplete;
      await Promise.resolve();

      let closeFired = false;
      el.addEventListener('menu-close', () => {
        closeFired = true;
      });

      const event = new MouseEvent('mousedown', { bubbles: true });
      document.body.dispatchEvent(event);

      expect(closeFired).toBe(true);
    });
  });

  describe('screen-size dropdown', () => {
    it('renders the default 15 standard sizes', () => {
      const select = el.querySelector<HTMLSelectElement>('select');
      const options = Array.from(select?.options ?? []);
      expect(options.length).toBe(15);
    });

    it('marks the currentScreenSize as selected', () => {
      const select = el.querySelector<HTMLSelectElement>('select');
      expect(select?.value).toBe('80x25');
    });

    it('changing currentScreenSize re-renders with new selection', async () => {
      el.currentScreenSize = '132x43';
      await el.updateComplete;
      const select = el.querySelector<HTMLSelectElement>('select');
      expect(select?.value).toBe('132x43');
    });

    it('supports a custom supportedScreenSizes list', async () => {
      el.supportedScreenSizes = ['100x30', '80x25'];
      el.currentScreenSize = '100x30';
      await el.updateComplete;
      const select = el.querySelector<HTMLSelectElement>('select');
      const options = Array.from(select?.options ?? []);
      expect(options.length).toBe(2);
      expect(options[0]?.value).toBe('100x30');
      expect(select?.value).toBe('100x30');
    });

    it('annotates 132x37 with (16:9)', () => {
      const select = el.querySelector<HTMLSelectElement>('select');
      const option = Array.from(select?.options ?? []).find((o) => o.value === '132x37');
      expect(option?.text).toContain('(16:9)');
    });

    it('annotates 132x52 with (5:4)', () => {
      const select = el.querySelector<HTMLSelectElement>('select');
      const option = Array.from(select?.options ?? []).find((o) => o.value === '132x52');
      expect(option?.text).toContain('(5:4)');
    });

    it('dispatches screen-size-change with parsed columns/rows', () => {
      const select = el.querySelector<HTMLSelectElement>('select');

      let captured: ScreenSizeChangeDetail | undefined;
      el.addEventListener('screen-size-change', (e): void => {
        captured = (e as CustomEvent<ScreenSizeChangeDetail>).detail;
      });

      select!.value = '132x43';
      select!.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ columns: 132, rows: 43 });
    });

    it('screen-size-change event bubbles and is composed', () => {
      const select = el.querySelector<HTMLSelectElement>('select');

      let captured: Event | undefined;
      el.addEventListener('screen-size-change', (e) => {
        captured = e;
      });

      select!.value = '80x50';
      select!.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured?.bubbles).toBe(true);
      expect(captured?.composed).toBe(true);
    });
  });

  describe('multiple instances', () => {
    it('two popups dispatch their own menu-action events independently', async () => {
      const second = document.createElement('f-menu-popup') as FMenuPopup;
      container.appendChild(second);
      await second.updateComplete;

      const firstActions: MenuActionName[] = [];
      const secondActions: MenuActionName[] = [];
      el.addEventListener('menu-action', (e): void => {
        firstActions.push((e as CustomEvent<MenuActionDetail>).detail.action);
      });
      second.addEventListener('menu-action', (e): void => {
        secondActions.push((e as CustomEvent<MenuActionDetail>).detail.action);
      });

      el.querySelector<HTMLAnchorElement>('a')!.click(); // first's Connect
      second.querySelector<HTMLAnchorElement>('a')!.click(); // second's Connect

      expect(firstActions).toEqual(['connect']);
      expect(secondActions).toEqual(['connect']);
    });
  });
});
