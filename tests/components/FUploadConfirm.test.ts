import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@components/FUploadConfirm.js';
import type {
  FUploadConfirm,
  UploadConfirmDetail,
} from '@components/index.js';

/*
  Tests for <f-upload-confirm>.

  Phase 5 Upload UI sub-project, originally Delta 1, extended for
  multi-file support in Delta 3.

  Coverage:
    - Default state (closed, empty files array)
    - Opens when open=true && files.length > 0
    - Single-file mode: renders name, size, modified, ZMODEM label
    - Multi-file mode: renders summary, total size, batch label
    - Details toggle expands/collapses the file list
    - Send button dispatches upload-confirm with files[]
    - Cancel button dispatches upload-cancel
    - ESC key cancels
    - Enter key confirms
    - Click outside cancels
    - Multi-drop regression: consecutive drops work
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
    it('is closed and has empty files array', () => {
      expect(el.open).toBe(false);
      expect(el.files).toEqual([]);
    });

    it('renders nothing when closed', () => {
      expect(el.querySelector('.fTelnetUploadConfirm')).toBeNull();
    });

    it('renders nothing when files is empty even if open', async () => {
      el.open = true;
      await el.updateComplete;
      expect(el.querySelector('.fTelnetUploadConfirm')).toBeNull();
    });
  });

  describe('single-file mode', () => {
    beforeEach(async () => {
      el.files = [
        new File(['hello world'], 'greet.txt', {
          type: 'text/plain',
          lastModified: new Date('2026-01-15T10:30:00').getTime(),
        }),
      ];
      el.open = true;
      await el.updateComplete;
    });

    it('renders the dialog', () => {
      expect(el.querySelector('.fTelnetUploadConfirm')).not.toBeNull();
    });

    it('uses the singular header text', () => {
      const header = el.querySelector('.fTelnetUploadConfirmHeader');
      expect(header?.textContent?.trim()).toBe('Confirm Upload');
    });

    it('shows the file name', () => {
      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('greet.txt');
    });

    it('shows the file size in bytes for small files', () => {
      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
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

    it('shows the singular Send button label', () => {
      const send = el.querySelector('.fTelnetUploadConfirmSend');
      expect(send?.textContent?.trim()).toBe('Send');
    });

    it('does NOT render the details toggle', () => {
      expect(
        el.querySelector('.fTelnetUploadConfirmDetailsToggle'),
      ).toBeNull();
    });
  });

  describe('multi-file mode (Phase 5 Delta 3)', () => {
    beforeEach(async () => {
      el.files = [
        new File(['a'.repeat(1024)], 'one.bin'),
        new File(['b'.repeat(2048)], 'two.bin'),
        new File(['c'.repeat(4096)], 'three.bin'),
      ];
      el.open = true;
      await el.updateComplete;
    });

    it('renders the dialog with batch header', () => {
      const header = el.querySelector('.fTelnetUploadConfirmHeader');
      expect(header?.textContent?.trim()).toBe('Confirm Upload (Batch)');
    });

    it('shows the file count', () => {
      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('3 files');
    });

    it('shows the total size', () => {
      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      // 1024 + 2048 + 4096 = 7168 bytes = 7.0 KB
      expect(text).toContain('7.0 KB');
    });

    it('shows the batch protocol label', () => {
      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('ZMODEM (batch)');
    });

    it('Send button label includes the file count', () => {
      const send = el.querySelector('.fTelnetUploadConfirmSend');
      expect(send?.textContent?.trim()).toBe('Send 3 files');
    });

    it('details list is collapsed by default', () => {
      expect(el.querySelector('.fTelnetUploadConfirmFileList')).toBeNull();
      const toggle = el.querySelector(
        '.fTelnetUploadConfirmDetailsToggle',
      );
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');
      expect(toggle?.textContent?.trim()).toBe('▸ Show details');
    });

    it('clicking the details toggle expands the file list', async () => {
      const toggle = el.querySelector<HTMLAnchorElement>(
        '.fTelnetUploadConfirmDetailsToggle',
      );
      toggle!.click();
      await el.updateComplete;

      const list = el.querySelector('.fTelnetUploadConfirmFileList');
      expect(list).not.toBeNull();

      const rows = el.querySelectorAll('.fTelnetUploadConfirmFileRow');
      expect(rows.length).toBe(3);

      // Each row has name + size
      const text = list?.textContent ?? '';
      expect(text).toContain('one.bin');
      expect(text).toContain('two.bin');
      expect(text).toContain('three.bin');

      // Toggle now says "Hide"
      expect(toggle?.textContent?.trim()).toBe('▾ Hide details');
      expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    });

    it('clicking the toggle a second time collapses again', async () => {
      const toggle = el.querySelector<HTMLAnchorElement>(
        '.fTelnetUploadConfirmDetailsToggle',
      );
      toggle!.click();
      await el.updateComplete;
      toggle!.click();
      await el.updateComplete;

      expect(el.querySelector('.fTelnetUploadConfirmFileList')).toBeNull();
    });

    it('file rows preserve the order from the files array', async () => {
      const toggle = el.querySelector<HTMLAnchorElement>(
        '.fTelnetUploadConfirmDetailsToggle',
      );
      toggle!.click();
      await el.updateComplete;

      const names = Array.from(
        el.querySelectorAll('.fTelnetUploadConfirmFileName'),
      ).map((e) => e.textContent);
      expect(names).toEqual(['one.bin', 'two.bin', 'three.bin']);
    });

    it('opening the dialog with a new batch starts collapsed', async () => {
      // Expand
      const toggle = el.querySelector<HTMLAnchorElement>(
        '.fTelnetUploadConfirmDetailsToggle',
      );
      toggle!.click();
      await el.updateComplete;
      expect(el.querySelector('.fTelnetUploadConfirmFileList')).not.toBeNull();

      // Close + reopen with a new batch — should be collapsed again.
      el.open = false;
      await el.updateComplete;
      el.files = [
        new File(['x'], 'new1.txt'),
        new File(['y'], 'new2.txt'),
      ];
      el.open = true;
      await el.updateComplete;

      expect(el.querySelector('.fTelnetUploadConfirmFileList')).toBeNull();
    });
  });

  describe('large batch handling', () => {
    it('renders correctly for 50 files', async () => {
      const files: File[] = [];
      for (let i = 0; i < 50; i++) {
        files.push(new File([`content-${i}`], `file-${i}.txt`));
      }
      el.files = files;
      el.open = true;
      await el.updateComplete;

      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('50 files');
      // List collapsed by default — even with 50 files the dialog
      // stays compact until the user opts in.
      expect(el.querySelector('.fTelnetUploadConfirmFileList')).toBeNull();
    });

    it('expanded 50-file list renders all rows', async () => {
      const files: File[] = [];
      for (let i = 0; i < 50; i++) {
        files.push(new File([`x`], `file-${i}.txt`));
      }
      el.files = files;
      el.open = true;
      await el.updateComplete;

      el.querySelector<HTMLAnchorElement>(
        '.fTelnetUploadConfirmDetailsToggle',
      )!.click();
      await el.updateComplete;

      const rows = el.querySelectorAll('.fTelnetUploadConfirmFileRow');
      expect(rows.length).toBe(50);
    });
  });

  describe('size formatting', () => {
    it('formats KB-range correctly', async () => {
      const parts = new Uint8Array(50 * 1024);
      el.files = [new File([parts], 'mid.bin')];
      el.open = true;
      await el.updateComplete;

      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('50.0 KB');
    });

    it('formats MB-range correctly', async () => {
      const parts = new Uint8Array(2 * 1024 * 1024);
      el.files = [new File([parts], 'big.bin')];
      el.open = true;
      await el.updateComplete;

      const text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('2.00 MB');
    });
  });

  describe('Send button', () => {
    it('dispatches upload-confirm with the single file in an array', async () => {
      const f = new File(['x'], 'x.txt');
      el.files = [f];
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
      expect(captured?.files.length).toBe(1);
      expect(captured?.files[0]).toBe(f);
    });

    it('dispatches upload-confirm with all files in a batch', async () => {
      const f1 = new File(['a'], 'a.txt');
      const f2 = new File(['b'], 'b.txt');
      const f3 = new File(['c'], 'c.txt');
      el.files = [f1, f2, f3];
      el.open = true;
      await el.updateComplete;

      let captured: UploadConfirmDetail | undefined;
      el.addEventListener('upload-confirm', (e): void => {
        captured = (e as CustomEvent<UploadConfirmDetail>).detail;
      });

      el.querySelector<HTMLAnchorElement>(
        '.fTelnetUploadConfirmSend',
      )!.click();

      expect(captured?.files).toEqual([f1, f2, f3]);
    });

    it('calls preventDefault on the click', async () => {
      el.files = [new File(['x'], 'x.txt')];
      el.open = true;
      await el.updateComplete;

      const sendBtn = el.querySelector<HTMLAnchorElement>(
        '.fTelnetUploadConfirmSend',
      );
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      sendBtn!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
    });

    it('does not dispatch when files is empty', async () => {
      el.files = [];
      el.open = true;
      await el.updateComplete;

      // Empty files = nothing rendered. There's no Send button to
      // click. But we can verify directly: if a consumer somehow
      // forces the dispatch, internal guard should still skip.
      let fired = 0;
      el.addEventListener('upload-confirm', () => fired++);

      // The dialog isn't open from the user POV, but we test the
      // guard by trying anyway — no Send button exists.
      const sendBtn = el.querySelector<HTMLAnchorElement>(
        '.fTelnetUploadConfirmSend',
      );
      expect(sendBtn).toBeNull();
      expect(fired).toBe(0);
    });
  });

  describe('Cancel button', () => {
    it('dispatches upload-cancel', async () => {
      el.files = [new File(['x'], 'x.txt')];
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
     * Fix: confirm handler in fTelnetClient now sets `files = []`
     * after consuming, matching the cancel handler.
     */
    it('three consecutive drops + Send dispatch three upload-confirm events', async () => {
      const events: string[] = [];
      el.addEventListener('upload-confirm', (e): void => {
        const detail = (e as CustomEvent<UploadConfirmDetail>).detail;
        // Single-file drops, so detail.files is length 1.
        events.push(detail.files[0]?.name ?? '');
      });

      const dropAndSend = async (name: string): Promise<void> => {
        el.files = [new File(['x'], name)];
        el.open = true;
        await el.updateComplete;

        const sendBtn = el.querySelector<HTMLAnchorElement>(
          '.fTelnetUploadConfirmSend',
        );
        sendBtn!.click();

        el.open = false;
        el.files = [];
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
        confirms.push(detail.files[0]?.name ?? '');
      });
      el.addEventListener('upload-cancel', (): void => {
        cancels.push(1);
      });

      // Drop, Send
      el.files = [new File(['x'], 'a.txt')];
      el.open = true;
      await el.updateComplete;
      el.querySelector<HTMLAnchorElement>('.fTelnetUploadConfirmSend')!.click();
      el.open = false;
      el.files = [];
      await el.updateComplete;

      // Drop, Cancel
      el.files = [new File(['x'], 'b.txt')];
      el.open = true;
      await el.updateComplete;
      el.querySelector<HTMLAnchorElement>(
        '.fTelnetUploadConfirmCancel',
      )!.click();
      el.open = false;
      el.files = [];
      await el.updateComplete;

      // Drop, Send
      el.files = [new File(['x'], 'c.txt')];
      el.open = true;
      await el.updateComplete;
      el.querySelector<HTMLAnchorElement>('.fTelnetUploadConfirmSend')!.click();

      expect(confirms).toEqual(['a.txt', 'c.txt']);
      expect(cancels.length).toBe(1);
    });
  });

  describe('keyboard handling', () => {
    it('ESC dispatches upload-cancel', async () => {
      el.files = [new File(['x'], 'x.txt')];
      el.open = true;
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 60));

      let fired = 0;
      el.addEventListener('upload-cancel', () => fired++);

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );

      expect(fired).toBe(1);
    });

    it('Enter dispatches upload-confirm', async () => {
      const f = new File(['x'], 'x.txt');
      el.files = [f];
      el.open = true;
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 60));

      let captured: UploadConfirmDetail | undefined;
      el.addEventListener('upload-confirm', (e): void => {
        captured = (e as CustomEvent<UploadConfirmDetail>).detail;
      });

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );

      expect(captured?.files[0]).toBe(f);
    });

    it('Enter on a batch dispatches all files', async () => {
      const f1 = new File(['a'], 'a.txt');
      const f2 = new File(['b'], 'b.txt');
      el.files = [f1, f2];
      el.open = true;
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 60));

      let captured: UploadConfirmDetail | undefined;
      el.addEventListener('upload-confirm', (e): void => {
        captured = (e as CustomEvent<UploadConfirmDetail>).detail;
      });

      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );

      expect(captured?.files).toEqual([f1, f2]);
    });

    it('other keys do nothing', async () => {
      el.files = [new File(['x'], 'x.txt')];
      el.open = true;
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 60));

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
      el.files = [new File(['x'], 'x.txt')];
      el.open = true;
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 60));

      let fired = 0;
      el.addEventListener('upload-cancel', () => fired++);

      const evt = new MouseEvent('mousedown', { bubbles: true });
      document.body.dispatchEvent(evt);

      expect(fired).toBe(1);
    });

    it('clicking inside the dialog does NOT dispatch upload-cancel', async () => {
      el.files = [new File(['x'], 'x.txt')];
      el.open = true;
      await el.updateComplete;
      await new Promise((r) => setTimeout(r, 60));

      let fired = 0;
      el.addEventListener('upload-cancel', () => fired++);

      const inner = el.querySelector<HTMLElement>('.fTelnetUploadConfirm');
      const evt = new MouseEvent('mousedown', { bubbles: true });
      inner?.dispatchEvent(evt);

      expect(fired).toBe(0);
    });
  });

  describe('transferProtocol reactivity (Phase 5)', () => {
    /**
     * Bug seen during 2.0.0-beta.1 smoke testing: switching the
     * Default Transfer Protocol setting to YMODEM correctly
     * relabeled the menu buttons, but the upload confirm dialog
     * still displayed "ZMODEM" in the Protocol row regardless of
     * the active protocol. The routing was correct (bytes flowed
     * through YModemSend) but the UI string lied about it.
     *
     * Fix: a reactive transferProtocol property mirrors the
     * fTelnetOptions setting; fTelnetClient pushes the current
     * value on construction and on every settings change.
     */
    it('defaults to displaying ZMODEM when transferProtocol is unset', async () => {
      el.files = [new File(['hello world'], 'test.txt')];
      el.open = true;
      await el.updateComplete;
      const text =
        el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('ZMODEM');
      expect(text).not.toContain('YMODEM');
    });

    it('displays YMODEM in single-file mode when transferProtocol="ymodem"', async () => {
      el.transferProtocol = 'ymodem';
      el.files = [new File(['hello world'], 'test.txt')];
      el.open = true;
      await el.updateComplete;
      const text =
        el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('YMODEM');
      expect(text).not.toContain('ZMODEM');
    });

    it('displays "YMODEM (batch)" in multi-file mode when transferProtocol="ymodem"', async () => {
      el.transferProtocol = 'ymodem';
      el.files = [
        new File(['a'.repeat(100)], 'a.txt'),
        new File(['b'.repeat(200)], 'b.txt'),
        new File(['c'.repeat(300)], 'c.txt'),
      ];
      el.open = true;
      await el.updateComplete;
      const text =
        el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('YMODEM (batch)');
      expect(text).not.toContain('ZMODEM (batch)');
    });

    it('re-renders live when transferProtocol is changed after open', async () => {
      el.files = [new File(['hello world'], 'test.txt')];
      el.open = true;
      await el.updateComplete;
      let text =
        el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('ZMODEM');

      el.transferProtocol = 'ymodem';
      await el.updateComplete;
      text = el.querySelector('.fTelnetUploadConfirm')?.textContent ?? '';
      expect(text).toContain('YMODEM');
      expect(text).not.toContain('ZMODEM');
    });
  });

  describe('i18n (beta.23)', () => {
    beforeEach(async () => {
      el.files = [
        new File(['hello world'], 'greet.txt', {
          type: 'text/plain',
          lastModified: new Date('2026-01-15T10:30:00').getTime(),
        }),
      ];
      el.open = true;
      await el.updateComplete;
    });

    it('renders English labels/buttons via t()', async () => {
      el.language = 'en';
      await el.updateComplete;
      const header = el.querySelector('.fTelnetUploadConfirmHeader');
      expect(header?.textContent?.trim()).toBe('Confirm Upload');
      const cancel = el.querySelector('.fTelnetUploadConfirmCancel');
      expect(cancel?.textContent?.trim()).toBe('Cancel');
      const send = el.querySelector('.fTelnetUploadConfirmSend');
      expect(send?.textContent?.trim()).toBe('Send');
    });

    it('has a settable language property (default en)', async () => {
      expect(el.language).toBe('en');
      el.language = 'de';
      await el.updateComplete;
      // No German for these keys yet → English fallback, but wired
      // and re-render succeeds.
      expect(el.language).toBe('de');
      expect(
        el.querySelector('.fTelnetUploadConfirmHeader')?.textContent?.trim()
          .length ?? 0,
      ).toBeGreaterThan(0);
    });

    it('batch send button uses the interpolated count', async () => {
      el.language = 'en';
      el.files = [
        new File(['a'], 'a.txt'),
        new File(['b'], 'b.txt'),
        new File(['c'], 'c.txt'),
      ];
      await el.updateComplete;
      const send = el.querySelector('.fTelnetUploadConfirmSend');
      expect(send?.textContent?.trim()).toBe('Send 3 files');
    });
  });
});
