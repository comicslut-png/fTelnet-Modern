import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@components/FConfirmDialog.js';
import type {
  FConfirmDialog,
  ConfirmDialogResultDetail,
} from '@components/index.js';

/*
  Tests for <f-confirm-dialog>.

  Phase 5 (beta.22) — a themed yes/no modal replacing the browser's
  native confirm() (e.g. the disconnect prompt). It reuses
  FInfoDialog's CSS classes for theming + title bar, adding a second
  (Cancel) button. Covers default state, title/message rendering, the
  two action buttons, and every result path (OK/Enter → confirmed
  true; Cancel/Escape/click-outside → confirmed false), plus the
  open-guard that prevents the triggering click/keypress from
  immediately dismissing it.
*/

describe('<f-confirm-dialog>', () => {
  let container: HTMLDivElement;
  let el: FConfirmDialog;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    el = document.createElement('f-confirm-dialog') as FConfirmDialog;
    container.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  // Open the dialog and advance past the open-guard window so
  // subsequent key/click events are honored.
  async function openPastGuard(): Promise<void> {
    el.open = true;
    await el.updateComplete;
    // OPEN_GUARD_MS is 50; advance real time a touch beyond it.
    await new Promise((r) => setTimeout(r, 60));
  }

  describe('default state', () => {
    it('registers as a custom element', () => {
      expect(customElements.get('f-confirm-dialog')).toBeDefined();
    });

    it('starts hidden (display:none on the root)', () => {
      const root = el.querySelector<HTMLDivElement>('.fTelnetInfoDialog');
      expect(root).not.toBeNull();
      expect(root!.style.display).toBe('none');
    });

    it('reuses the themed InfoDialog regions (header, body, footer)', () => {
      expect(el.querySelector('.fTelnetInfoDialogHeader')).not.toBeNull();
      expect(el.querySelector('.fTelnetInfoDialogBody')).not.toBeNull();
      expect(el.querySelector('.fTelnetInfoDialogFooter')).not.toBeNull();
    });

    it('renders both an OK and a Cancel button', () => {
      const buttons = el.querySelectorAll('.fTelnetInfoDialogOk');
      expect(buttons.length).toBe(2);
    });

    it('the cancel button carries the distinguishing class', () => {
      const cancel = el.querySelector('.fTelnetConfirmDialogCancel');
      expect(cancel).not.toBeNull();
    });

    it('uses default OK / Cancel labels', () => {
      const buttons = Array.from(
        el.querySelectorAll('.fTelnetInfoDialogOk'),
      ).map((b) => b.textContent?.trim());
      expect(buttons).toContain('OK');
      expect(buttons).toContain('Cancel');
    });
  });

  describe('content', () => {
    it('renders the title in the header', async () => {
      el.dialogTitle = 'Disconnect';
      await el.updateComplete;
      const header = el.querySelector('.fTelnetInfoDialogHeader');
      expect(header?.textContent?.trim()).toBe('Disconnect');
    });

    it('renders the message in the body', async () => {
      el.message = 'Are you sure you want to disconnect?';
      await el.updateComplete;
      const body = el.querySelector('.fTelnetInfoDialogBody');
      expect(body?.textContent).toContain('disconnect');
    });

    it('honors custom button labels', async () => {
      el.okLabel = 'Yes';
      el.cancelLabel = 'No';
      await el.updateComplete;
      const labels = Array.from(
        el.querySelectorAll('.fTelnetInfoDialogOk'),
      ).map((b) => b.textContent?.trim());
      expect(labels).toContain('Yes');
      expect(labels).toContain('No');
    });

    it('becomes visible when open is set', async () => {
      el.open = true;
      await el.updateComplete;
      const root = el.querySelector<HTMLDivElement>('.fTelnetInfoDialog');
      expect(root!.style.display).not.toBe('none');
    });
  });

  describe('result paths', () => {
    it('OK button resolves confirmed=true', async () => {
      await openPastGuard();
      let result: ConfirmDialogResultDetail | undefined;
      el.addEventListener('confirm-dialog-result', (e) => {
        result = (e as CustomEvent<ConfirmDialogResultDetail>).detail;
      });
      const ok = el.querySelector<HTMLButtonElement>(
        '.fTelnetInfoDialogOk:not(.fTelnetConfirmDialogCancel)',
      );
      ok!.click();
      expect(result).toEqual({ confirmed: true });
    });

    it('Cancel button resolves confirmed=false', async () => {
      await openPastGuard();
      let result: ConfirmDialogResultDetail | undefined;
      el.addEventListener('confirm-dialog-result', (e) => {
        result = (e as CustomEvent<ConfirmDialogResultDetail>).detail;
      });
      const cancel = el.querySelector<HTMLButtonElement>(
        '.fTelnetConfirmDialogCancel',
      );
      cancel!.click();
      expect(result).toEqual({ confirmed: false });
    });

    it('Enter key resolves confirmed=true', async () => {
      await openPastGuard();
      let result: ConfirmDialogResultDetail | undefined;
      el.addEventListener('confirm-dialog-result', (e) => {
        result = (e as CustomEvent<ConfirmDialogResultDetail>).detail;
      });
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter' }),
      );
      expect(result).toEqual({ confirmed: true });
    });

    it('Escape key resolves confirmed=false', async () => {
      await openPastGuard();
      let result: ConfirmDialogResultDetail | undefined;
      el.addEventListener('confirm-dialog-result', (e) => {
        result = (e as CustomEvent<ConfirmDialogResultDetail>).detail;
      });
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape' }),
      );
      expect(result).toEqual({ confirmed: false });
    });

    it('click-outside resolves confirmed=false', async () => {
      await openPastGuard();
      let result: ConfirmDialogResultDetail | undefined;
      el.addEventListener('confirm-dialog-result', (e) => {
        result = (e as CustomEvent<ConfirmDialogResultDetail>).detail;
      });
      // A mousedown on the body (outside the dialog element) cancels.
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true }),
      );
      expect(result).toEqual({ confirmed: false });
    });
  });

  describe('open guard', () => {
    it('ignores Enter/Escape fired within the guard window', async () => {
      // Open but do NOT advance past the guard.
      el.open = true;
      await el.updateComplete;
      let fired = false;
      el.addEventListener('confirm-dialog-result', () => {
        fired = true;
      });
      // Immediately dispatch — should be swallowed by the guard.
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter' }),
      );
      document.body.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true }),
      );
      expect(fired).toBe(false);
    });
  });

  describe('listener hygiene', () => {
    it('removes document listeners when closed', async () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      el.open = true;
      await el.updateComplete;
      el.open = false;
      await el.updateComplete;
      expect(removeSpy).toHaveBeenCalledWith(
        'keydown',
        expect.any(Function),
        true,
      );
      removeSpy.mockRestore();
    });
  });
});
