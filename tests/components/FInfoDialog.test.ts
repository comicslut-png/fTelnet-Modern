import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@components/FInfoDialog.js';
import type { FInfoDialog, InfoDialogCloseDetail } from '@components/index.js';

/*
  Tests for <f-info-dialog>.

  Phase 5 (beta.4) — a themed modal replacing alert() for
  informational messages. Covers default state, visibility,
  title/message rendering, paragraph splitting, and the four
  dismissal paths (OK button, Escape, Enter, click-outside).
*/

describe('<f-info-dialog>', () => {
  let container: HTMLDivElement;
  let el: FInfoDialog;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    el = document.createElement('f-info-dialog') as FInfoDialog;
    container.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('default state', () => {
    it('registers as a custom element', () => {
      expect(customElements.get('f-info-dialog')).toBeDefined();
    });

    it('starts hidden (display:none on the root)', () => {
      const root = el.querySelector<HTMLDivElement>('.fTelnetInfoDialog');
      expect(root).not.toBeNull();
      expect(root!.style.display).toBe('none');
    });

    it('renders header, body, and footer regions', () => {
      expect(el.querySelector('.fTelnetInfoDialogHeader')).not.toBeNull();
      expect(el.querySelector('.fTelnetInfoDialogBody')).not.toBeNull();
      expect(el.querySelector('.fTelnetInfoDialogFooter')).not.toBeNull();
    });

    it('renders an OK button', () => {
      const ok = el.querySelector('.fTelnetInfoDialogOk');
      expect(ok).not.toBeNull();
      expect(ok!.textContent?.trim()).toBe('OK');
    });
  });

  describe('content', () => {
    it('renders the title in the header', async () => {
      el.dialogTitle = 'Downloading Files';
      await el.updateComplete;
      const header = el.querySelector('.fTelnetInfoDialogHeader');
      expect(header?.textContent?.trim()).toBe('Downloading Files');
    });

    it('renders a single-paragraph message', async () => {
      el.message = 'Just one paragraph.';
      await el.updateComplete;
      const paras = el.querySelectorAll('.fTelnetInfoDialogParagraph');
      expect(paras.length).toBe(1);
      expect(paras[0]!.textContent?.trim()).toBe('Just one paragraph.');
    });

    it('splits a multi-paragraph message on blank lines', async () => {
      el.message = 'First para.\n\nSecond para.\n\nThird para.';
      await el.updateComplete;
      const paras = el.querySelectorAll('.fTelnetInfoDialogParagraph');
      expect(paras.length).toBe(3);
    });

    it('renders single newlines within a paragraph as <br>', async () => {
      el.message = 'Line one\nLine two';
      await el.updateComplete;
      const para = el.querySelector('.fTelnetInfoDialogParagraph');
      expect(para!.querySelector('br')).not.toBeNull();
    });
  });

  describe('visibility', () => {
    it('open=true removes display:none', async () => {
      el.open = true;
      await el.updateComplete;
      const root = el.querySelector<HTMLDivElement>('.fTelnetInfoDialog');
      expect(root!.style.display).not.toBe('none');
    });

    it('open=false re-applies display:none', async () => {
      el.open = true;
      await el.updateComplete;
      el.open = false;
      await el.updateComplete;
      const root = el.querySelector<HTMLDivElement>('.fTelnetInfoDialog');
      expect(root!.style.display).toBe('none');
    });
  });

  describe('dismissal', () => {
    /**
     * The open-guard ignores Escape/Enter/outside-click within
     * OPEN_GUARD_MS (50ms) of opening. Tests that need to exercise
     * those paths wait past the guard window first.
     */
    async function openPastGuard(): Promise<void> {
      el.open = true;
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 60));
    }

    it('clicking OK dispatches info-dialog-close', async () => {
      await openPastGuard();
      const ok = el.querySelector<HTMLButtonElement>('.fTelnetInfoDialogOk');

      let fired = 0;
      let captured: InfoDialogCloseDetail | undefined;
      el.addEventListener('info-dialog-close', (e): void => {
        fired++;
        captured = (e as CustomEvent<InfoDialogCloseDetail>).detail;
      });

      ok!.click();
      expect(fired).toBe(1);
      expect(captured).toBeDefined();
    });

    it('OK click calls preventDefault', async () => {
      await openPastGuard();
      const ok = el.querySelector<HTMLButtonElement>('.fTelnetInfoDialogOk');
      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      ok!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
    });

    it('Escape key dispatches info-dialog-close', async () => {
      await openPastGuard();
      let fired = 0;
      el.addEventListener('info-dialog-close', () => fired++);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      expect(fired).toBe(1);
    });

    it('Enter key dispatches info-dialog-close', async () => {
      await openPastGuard();
      let fired = 0;
      el.addEventListener('info-dialog-close', () => fired++);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      expect(fired).toBe(1);
    });

    it('click outside dispatches info-dialog-close', async () => {
      await openPastGuard();
      let fired = 0;
      el.addEventListener('info-dialog-close', () => fired++);

      // Click on the document body, outside the dialog element.
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true }),
      );
      expect(fired).toBe(1);
    });

    it('does NOT dismiss on Escape within the open-guard window', async () => {
      el.open = true;
      await el.updateComplete;
      // No wait — fire immediately, inside the 50ms guard.
      let fired = 0;
      el.addEventListener('info-dialog-close', () => fired++);
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      expect(fired).toBe(0);
    });

    it('does not respond to keys when closed', () => {
      let fired = 0;
      el.addEventListener('info-dialog-close', () => fired++);
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      expect(fired).toBe(0);
    });
  });
});
