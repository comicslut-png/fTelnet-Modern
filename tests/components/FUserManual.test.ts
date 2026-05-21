import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@components/FUserManual.js';
import type {
  FUserManual,
  ManualCloseDetail,
} from '@components/index.js';

/*
  Tests for <f-user-manual>.

  Phase 5 (beta.3) — a floating, draggable, resizable popup that
  shows the user manual. Covers:
    - Default state + DOM shape
    - Open/close visibility
    - Title bar drag (mouse-driven, not testable in detail here)
    - Close button click → manual-close event
    - TOC anchor clicks scroll within the body
    - Resetting position state
    - Theme attribute pass-through
*/

describe('<f-user-manual>', () => {
  let container: HTMLDivElement;
  let el: FUserManual;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    el = document.createElement('f-user-manual') as FUserManual;
    container.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('default state', () => {
    it('registers as a custom element', () => {
      expect(customElements.get('f-user-manual')).toBeDefined();
    });

    it('defaults to closed (display:none on the root)', () => {
      const root = el.querySelector<HTMLDivElement>('.fTelnetUserManual');
      expect(root).not.toBeNull();
      expect(root!.style.display).toBe('none');
    });

    it('renders the header with title and close button', () => {
      const title = el.querySelector('.fTelnetUserManualTitle');
      const close = el.querySelector('.fTelnetUserManualClose');
      expect(title?.textContent?.trim()).toBe('fTelnet User Manual');
      expect(close).not.toBeNull();
    });

    it('renders the body with the manual content', () => {
      const body = el.querySelector('.fTelnetUserManualBody');
      expect(body).not.toBeNull();
      const text = body?.textContent ?? '';
      // Sanity-check: a few keywords from the manual content
      // should be present. We don't assert exact prose because the
      // content evolves; we just want to know the body renders.
      expect(text).toContain('Welcome to fTelnet');
      expect(text).toContain('BBS');
      expect(text).toContain('ZMODEM');
      expect(text).toContain('YMODEM');
    });

    it('renders all expected TOC anchors', () => {
      const expectedAnchors = [
        'connect-disconnect',
        'copy-paste',
        'upload-download',
        'about-transfers',
        'keyboard',
        'screen-size',
        'scrollback',
        'settings',
        'tips',
      ];
      for (const anchor of expectedAnchors) {
        const target = el.querySelector(`[data-anchor="${anchor}"]`);
        expect(target).not.toBeNull();
      }
    });

    it('TOC contains a link for each section', () => {
      const tocLinks = el.querySelectorAll('.fTelnetUserManualToc a');
      // 9 sections in the TOC
      expect(tocLinks.length).toBe(9);
    });
  });

  describe('visibility', () => {
    it('open=true removes display:none', async () => {
      el.open = true;
      await el.updateComplete;
      const root = el.querySelector<HTMLDivElement>('.fTelnetUserManual');
      expect(root!.style.display).not.toBe('none');
    });

    it('open=false re-applies display:none', async () => {
      el.open = true;
      await el.updateComplete;
      el.open = false;
      await el.updateComplete;
      const root = el.querySelector<HTMLDivElement>('.fTelnetUserManual');
      expect(root!.style.display).toBe('none');
    });
  });

  describe('first-open centering', () => {
    /**
     * The component centers itself on first open based on viewport
     * size. After that, the user may have dragged it elsewhere; we
     * don't re-center on subsequent opens. resetPosition() restores
     * the "next open will re-center" behavior, which the host uses
     * on disconnect.
     */
    it('centers in viewport on first open', async () => {
      const startX = el.pageX;
      const startY = el.pageY;
      el.open = true;
      await el.updateComplete;
      // pageX/pageY should have changed from initial 0 values
      // (assuming a non-zero-size viewport, which jsdom provides).
      expect(el.pageX).not.toBe(startX);
      expect(el.pageY).not.toBe(startY);
    });

    it('does NOT re-center on second open', async () => {
      el.open = true;
      await el.updateComplete;
      const positionedX = el.pageX;
      const positionedY = el.pageY;

      // Simulate user drag by directly mutating pageX/pageY
      el.pageX = 50;
      el.pageY = 100;
      el.open = false;
      await el.updateComplete;
      el.open = true;
      await el.updateComplete;

      // After 2nd open, position should NOT have been re-centered
      // (it would have been if the centering ran again).
      expect(el.pageX).toBe(50);
      expect(el.pageY).toBe(100);
      // Sanity: distinct from the original centering values
      expect(positionedX).not.toBe(50);
      expect(positionedY).not.toBe(100);
    });

    it('resetPosition() re-enables centering on next open', async () => {
      el.open = true;
      await el.updateComplete;

      el.pageX = 50;
      el.pageY = 100;
      el.open = false;
      el.resetPosition();
      el.open = true;
      await el.updateComplete;

      // After reset, opening again re-centers — so pageX/pageY are
      // NOT the dragged-to values.
      expect(el.pageX).not.toBe(50);
      expect(el.pageY).not.toBe(100);
    });
  });

  describe('close button', () => {
    it('clicking close dispatches manual-close', async () => {
      el.open = true;
      await el.updateComplete;
      const close = el.querySelector<HTMLAnchorElement>(
        '.fTelnetUserManualClose',
      );

      let fired = 0;
      let captured: ManualCloseDetail | undefined;
      el.addEventListener('manual-close', (e): void => {
        fired++;
        captured = (e as CustomEvent<ManualCloseDetail>).detail;
      });

      close!.click();
      expect(fired).toBe(1);
      expect(captured).toBeDefined();
    });

    it('calls preventDefault on the click', async () => {
      el.open = true;
      await el.updateComplete;
      const close = el.querySelector<HTMLAnchorElement>(
        '.fTelnetUserManualClose',
      );
      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      close!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
    });
  });

  describe('TOC navigation', () => {
    /**
     * TOC links scroll within the popup's own body (not navigate
     * the host page). We can't fully test scrolling in jsdom (no
     * actual layout), but we can verify the click handler
     * preventDefaults the event so the browser doesn't navigate.
     */
    it('TOC anchor click is intercepted (preventDefault)', async () => {
      el.open = true;
      await el.updateComplete;

      const firstTocLink =
        el.querySelector<HTMLAnchorElement>('.fTelnetUserManualToc a');
      expect(firstTocLink).not.toBeNull();

      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      firstTocLink!.dispatchEvent(click);

      expect(click.defaultPrevented).toBe(true);
    });
  });

  describe('multiple instances', () => {
    it('each instance fires its own manual-close event', async () => {
      const second = document.createElement('f-user-manual') as FUserManual;
      container.appendChild(second);
      await second.updateComplete;

      el.open = true;
      second.open = true;
      await el.updateComplete;
      await second.updateComplete;

      let firstFired = 0;
      let secondFired = 0;
      el.addEventListener('manual-close', () => firstFired++);
      second.addEventListener('manual-close', () => secondFired++);

      el.querySelector<HTMLAnchorElement>('.fTelnetUserManualClose')!.click();
      second
        .querySelector<HTMLAnchorElement>('.fTelnetUserManualClose')!
        .click();

      expect(firstFired).toBe(1);
      expect(secondFired).toBe(1);
    });
  });
});
