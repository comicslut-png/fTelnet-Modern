import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@components/FFocusWarning.js';
import type { FFocusWarning } from '@components/index.js';

/*
  Tests for <f-focus-warning>, the first Lit component.

  Scope: construction, reactive property updates, DOM-state
  correspondence. The component is passive (no events), so the
  test surface is narrow — verify what gets rendered into the
  light DOM tracks the visible/widthPx properties.

  These tests also serve as the canonical example for the
  pattern: detached container, await updateComplete, assert
  against el.querySelector. Subsequent component tests follow
  the same shape.
*/

describe('<f-focus-warning>', () => {
  let container: HTMLDivElement;
  let el: FFocusWarning;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    el = document.createElement('f-focus-warning') as FFocusWarning;
    container.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('default state', () => {
    it('registers as a custom element', () => {
      expect(customElements.get('f-focus-warning')).toBeDefined();
    });

    it('starts with visible=false and widthPx=0', () => {
      expect(el.visible).toBe(false);
      expect(el.widthPx).toBe(0);
    });

    it('renders an inner div with the legacy CSS class', () => {
      const inner = el.querySelector('.fTelnetFocusWarning');
      expect(inner).not.toBeNull();
    });

    it('renders the canonical warning text', () => {
      const inner = el.querySelector('.fTelnetFocusWarning');
      expect(inner?.textContent?.trim()).toBe(
        '*** CLICK HERE TO ENABLE KEYBOARD INPUT ***'
      );
    });

    it('is hidden by default (display: none in inline style)', () => {
      const inner = el.querySelector<HTMLElement>('.fTelnetFocusWarning');
      expect(inner?.getAttribute('style')).toContain('display: none');
    });
  });

  describe('visibility reactivity', () => {
    it('setting visible=true removes display:none', async () => {
      el.visible = true;
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetFocusWarning');
      const style = inner?.getAttribute('style') ?? '';
      expect(style).not.toContain('display: none');
    });

    it('toggling visible re-renders correctly', async () => {
      el.visible = true;
      await el.updateComplete;
      el.visible = false;
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetFocusWarning');
      expect(inner?.getAttribute('style')).toContain('display: none');
    });
  });

  describe('widthPx reactivity', () => {
    it('setting widthPx > 0 stamps an inline width', async () => {
      el.widthPx = 480;
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetFocusWarning');
      expect(inner?.getAttribute('style')).toContain('width: 480px');
    });

    it('widthPx 0 omits the width style fragment', async () => {
      el.widthPx = 480;
      await el.updateComplete;
      el.widthPx = 0;
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetFocusWarning');
      expect(inner?.getAttribute('style') ?? '').not.toContain('width:');
    });

    it('width and visibility combine without clobbering each other', async () => {
      el.widthPx = 800;
      el.visible = true;
      await el.updateComplete;
      const style = el.querySelector('.fTelnetFocusWarning')?.getAttribute('style') ?? '';
      expect(style).toContain('width: 800px');
      expect(style).not.toContain('display: none');
    });

    it('width and hidden-state combine', async () => {
      el.widthPx = 800;
      el.visible = false;
      await el.updateComplete;
      const style = el.querySelector('.fTelnetFocusWarning')?.getAttribute('style') ?? '';
      expect(style).toContain('width: 800px');
      expect(style).toContain('display: none');
    });
  });

  describe('attribute interop', () => {
    it('the visible attribute on HTML maps to the visible property', async () => {
      const standalone = document.createElement('f-focus-warning') as FFocusWarning;
      standalone.setAttribute('visible', '');
      container.appendChild(standalone);
      await standalone.updateComplete;
      expect(standalone.visible).toBe(true);
    });

    it('the width-px attribute maps to the widthPx property', async () => {
      const standalone = document.createElement('f-focus-warning') as FFocusWarning;
      standalone.setAttribute('width-px', '640');
      container.appendChild(standalone);
      await standalone.updateComplete;
      expect(standalone.widthPx).toBe(640);
    });
  });

  describe('multiple instances', () => {
    it('two instances maintain independent state', async () => {
      const second = document.createElement('f-focus-warning') as FFocusWarning;
      container.appendChild(second);
      await second.updateComplete;

      el.visible = true;
      el.widthPx = 480;
      await el.updateComplete;

      second.visible = false;
      second.widthPx = 800;
      await second.updateComplete;

      expect(el.visible).toBe(true);
      expect(el.widthPx).toBe(480);
      expect(second.visible).toBe(false);
      expect(second.widthPx).toBe(800);
    });
  });
});
