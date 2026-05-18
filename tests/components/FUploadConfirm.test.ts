import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@components/FUploadConfirm.js';
import type {
  FUploadConfirm,
  UploadConfirmDetail,
} from '@components/index.js';

/*
  Tests for <f-upload-confirm>.

  Phase 5 Upload UI sub-project, Delta 1.

  Coverage:
    - Default state (closed, no file)
    - Opens when open=true && file !== null
    - Renders file name, size, modified date
    - Renders ZMODEM protocol label
    - Renders the warning text
    - Send button dispatches upload-confirm with the file
    - Cancel button dispatches upload-cancel
    - ESC key cancels
    - Enter key confirms
    - Click outside cancels
*/

describe('<f-upload-confirm>', () => {
  let el: FUploadConfirm;

  beforeEach(async () => {
    el = document.createElement('f-upload-confirm') as FUploadConfirm;
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(el);
  });

  describe('default state', () => {
    it('is closed and has no file', () => {
      expect(el.open).toBe(false);
      expect(el.file).toBeNull();
    });

    it('renders nothing when closed', () => {
      expect(el.querySelector('.fTelnetUploadConfirm')).toBeNull();
    });
  });

  describe('when open with a file', () => {
    beforeEach(async () => {
      el.file = new File(['hello world'], 'greet.txt', {
        type: 'text/plain',
        lastModified: new Date('2026-01-15T10:30:00').getTime(),
      });
      el.open = true;
      await el.updateComplete;
    });

    it('renders the dialog', () => {
      expect(el.querySelector('.fTelnetUploadConfirm')).not.toBeNull();
    });

    it('shows the file name', () => {
      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('greet.txt');
    });

    it('shows the file size in bytes for small files', () => {
      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      // "hello world" = 11 bytes
      expect(text).toContain('11 bytes');
    });

    it('shows the ZMODEM protocol label', () => {
      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('ZMODEM');
    });

    it('shows the upload-prompt warning', () => {
      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('upload prompt');
    });
  });

  describe('size formatting', () => {
    it('formats KB-range correctly', async () => {
      // Create a fake File with a custom size (jsdom File honors the
      // constructor's parts byte length).
      const parts = new Uint8Array(50 * 1024); // 50 KB
      el.file = new File([parts], 'mid.bin');
      el.open = true;
      await el.updateComplete;

      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('50.0 KB');
    });

    it('formats MB-range correctly', async () => {
      const parts = new Uint8Array(2 * 1024 * 1024); // 2 MB
      el.file = new File([parts], 'big.bin');
      el.open = true;
      await el.updateComplete;

      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('2.00 MB');
    });
  });

  describe('Send button', () => {
    it('dispatches upload-confirm with the file', async () => {
      const f = new File(['x'], 'x.txt');
      el.file = f;
      el.open = true;
      await el.updateComplete;

      let captured: UploadConfirmDetail | undefined;
      el.addEventListener('upload-confirm', (e): void => {
        captured = (e as CustomEvent<UploadConfirmDetail>).detail;
      });

      const sendBtn = el.querySelector<HTMLAnchorElement>(
        '.fTelnetUploadConfirmSend',
      );
      sendBtn!.click();

      expect(captured).toBeDefined();
      expect(captured?.file).toBe(f);
    });

    it('calls preventDefault on the click', async () => {
      el.file = new File(['x'], 'x.txt');
      el.open = true;
      await el.updateComplete;

      const sendBtn = el.querySelector<HTMLAnchorElement>(
        '.fTelnetUploadConfirmSend',
      );
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      sendBtn!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
    });
  });

  describe('Cancel button', () => {
    it('dispatches upload-cancel', async () => {
      el.file = new File(['x'], 'x.txt');
      el.open = true;
      await el.updateComplete;

      let fired = 0;
      el.addEventListener('upload-cancel', () => fired++);

      const cancelBtn = el.querySelector<HTMLAnchorElement>(
        '.fTelnetUploadConfirmCancel',
      );
      cancelBtn!.click();

      expect(fired).toBe(1);
    });
  });

  describe('multi-drop regression (Phase 5 Delta 1)', () => {
    /**
     * Regression for the bug where the Send button on the second
     * drop in a session would silently do nothing. Root cause:
     * the confirm handler in fTelnetClient was not nulling out
     * `file` after consuming the event (the cancel handler was,
     * but confirm wasn't). The asymmetric reset left a stale-state
     * window where the next file assignment + open=true didn't
     * properly re-arm the component.
     *
     * Fix: confirm handler in fTelnetClient now sets `file = null`
     * after consuming, matching the cancel handler.
     *
     * This test verifies the component side: after Send is clicked,
     * the consumer's expected reset (file=null, open=false) leaves
     * the component in a state where the NEXT file+open sequence
     * dispatches a fresh upload-confirm correctly.
     */
    it('three consecutive drops + Send dispatch three upload-confirm events', async () => {
      const events: string[] = [];
      el.addEventListener('upload-confirm', (e): void => {
        const detail = (e as CustomEvent<UploadConfirmDetail>).detail;
        events.push(detail.file.name);
      });

      // Helper: simulate the consumer's flow.
      const dropAndSend = async (name: string): Promise<void> => {
        el.file = new File(['x'], name);
        el.open = true;
        await el.updateComplete;

        const sendBtn = el.querySelector<HTMLAnchorElement>(
          '.fTelnetUploadConfirmSend',
        );
        sendBtn!.click();

        // The consumer (fTelnetClient) resets both properties
        // after consuming the event. Simulate that here.
        el.open = false;
        el.file = null;
        await el.updateComplete;
      };

      await dropAndSend('first.zip');
      await dropAndSend('second.zip');
      await dropAndSend('third.zip');

      expect(events).toEqual(['first.zip', 'second.zip', 'third.zip']);
    });

    it('drops alternating with cancels still work', async () => {
      const confirms: string[] = [];
      const cancels: number[] = [];
      el.addEventListener('upload-confirm', (e): void => {
        const detail = (e as CustomEvent<UploadConfirmDetail>).detail;
        confirms.push(detail.file.name);
      });
      el.addEventListener('upload-cancel', (): void => {
        cancels.push(1);
      });

      // Drop, Send
      el.file = new File(['x'], 'a.txt');
      el.open = true;
      await el.updateComplete;
      el.querySelector<HTMLAnchorElement>('.fTelnetUploadConfirmSend')!.click();
      el.open = false;
      el.file = null;
      await el.updateComplete;

      // Drop, Cancel
      el.file = new File(['x'], 'b.txt');
      el.open = true;
      await el.updateComplete;
      el.querySelector<HTMLAnchorElement>(
        '.fTelnetUploadConfirmCancel',
      )!.click();
      el.open = false;
      el.file = null;
      await el.updateComplete;

      // Drop, Send
      el.file = new File(['x'], 'c.txt');
      el.open = true;
      await el.updateComplete;
      el.querySelector<HTMLAnchorElement>('.fTelnetUploadConfirmSend')!.click();

      expect(confirms).toEqual(['a.txt', 'c.txt']);
      expect(cancels.length).toBe(1);
    });
  });

  describe('keyboard handling', () => {
    it('ESC dispatches upload-cancel', async () => {
      el.file = new File(['x'], 'x.txt');
      el.open = true;
      await el.updateComplete;
      await Promise.resolve(); // microtask defer

      let fired = 0;
      el.addEventListener('upload-cancel', () => fired++);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );

      expect(fired).toBe(1);
    });

    it('Enter dispatches upload-confirm', async () => {
      const f = new File(['x'], 'x.txt');
      el.file = f;
      el.open = true;
      await el.updateComplete;
      await Promise.resolve();

      let captured: UploadConfirmDetail | undefined;
      el.addEventListener('upload-confirm', (e): void => {
        captured = (e as CustomEvent<UploadConfirmDetail>).detail;
      });

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );

      expect(captured?.file).toBe(f);
    });

    it('other keys do nothing', async () => {
      el.file = new File(['x'], 'x.txt');
      el.open = true;
      await el.updateComplete;
      await Promise.resolve();

      let confirmFired = 0;
      let cancelFired = 0;
      el.addEventListener('upload-confirm', () => confirmFired++);
      el.addEventListener('upload-cancel', () => cancelFired++);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
      );

      expect(confirmFired).toBe(0);
      expect(cancelFired).toBe(0);
    });
  });

  describe('click-outside-to-cancel', () => {
    it('clicking outside the dialog dispatches upload-cancel', async () => {
      el.file = new File(['x'], 'x.txt');
      el.open = true;
      await el.updateComplete;
      await Promise.resolve();

      let fired = 0;
      el.addEventListener('upload-cancel', () => fired++);

      const evt = new MouseEvent('mousedown', { bubbles: true });
      document.body.dispatchEvent(evt);

      expect(fired).toBe(1);
    });

    it('clicking inside the dialog does NOT dispatch upload-cancel', async () => {
      el.file = new File(['x'], 'x.txt');
      el.open = true;
      await el.updateComplete;
      await Promise.resolve();

      let fired = 0;
      el.addEventListener('upload-cancel', () => fired++);

      const inner = el.querySelector<HTMLElement>('.fTelnetUploadConfirm');
      const evt = new MouseEvent('mousedown', { bubbles: true });
      inner?.dispatchEvent(evt);

      expect(fired).toBe(0);
    });
  });
});
