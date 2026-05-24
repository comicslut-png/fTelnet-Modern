import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@components/FReconnectDialog.js';
import type {
  FReconnectDialog,
  ReconnectDialogResultDetail,
} from '@components/index.js';

/*
  Tests for <f-reconnect-dialog>.

  Phase 5 (beta.41) — a themed countdown popup shown after an
  UNEXPECTED disconnect. Counts down from `seconds`, single Cancel
  button. On expiry it fires reconnect-dialog-result{reconnect:true};
  on Cancel/Escape it fires {reconnect:false}. Outside-click does
  nothing (unlike the confirm dialog) so a misclick can't cancel an
  automatic reconnect. Reuses FInfoDialog CSS classes for theming.
*/

describe('<f-reconnect-dialog>', () => {
  let container: HTMLDivElement;
  let el: FReconnectDialog;

  let nowValue = 0;

  beforeEach(async () => {
    nowValue = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => nowValue);
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    el = document.createElement('f-reconnect-dialog') as FReconnectDialog;
    container.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function open(seconds = 5): Promise<void> {
    el.seconds = seconds;
    el.open = true;
    await el.updateComplete;
    // Advance past the open-guard window (the guard reads
    // performance.now(), which we drive manually here so it tracks
    // with the fake timer clock used for the countdown).
    nowValue += 60;
  }

  it('is hidden by default', () => {
    const dialog = el.querySelector('.fTelnetInfoDialog') as HTMLElement;
    expect(dialog.style.display).toBe('none');
  });

  it('shows the title and the initial countdown body', async () => {
    await open(5);
    const header = el.querySelector('.fTelnetInfoDialogHeader');
    const body = el.querySelector('.fTelnetInfoDialogBody');
    expect(header?.textContent).toContain('Connection lost');
    expect(body?.textContent).toContain('5');
  });

  it('has exactly one (Cancel) button', async () => {
    await open();
    const buttons = el.querySelectorAll('button');
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent?.trim()).toBe('Cancel');
  });

  it('ticks the countdown down each second', async () => {
    await open(5);
    vi.advanceTimersByTime(1000);
    await el.updateComplete;
    expect(el.querySelector('.fTelnetInfoDialogBody')?.textContent).toContain(
      '4',
    );
    vi.advanceTimersByTime(1000);
    await el.updateComplete;
    expect(el.querySelector('.fTelnetInfoDialogBody')?.textContent).toContain(
      '3',
    );
  });

  it('fires reconnect:true when the countdown reaches zero', async () => {
    await open(2);
    let result: ReconnectDialogResultDetail | undefined;
    el.addEventListener('reconnect-dialog-result', (e: Event) => {
      result = (e as CustomEvent<ReconnectDialogResultDetail>).detail;
    });
    vi.advanceTimersByTime(2000);
    expect(result).toEqual({ reconnect: true });
  });

  it('fires reconnect:false when Cancel is clicked', async () => {
    await open(5);
    let result: ReconnectDialogResultDetail | undefined;
    el.addEventListener('reconnect-dialog-result', (e: Event) => {
      result = (e as CustomEvent<ReconnectDialogResultDetail>).detail;
    });
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(result).toEqual({ reconnect: false });
  });

  it('fires reconnect:false on Escape', async () => {
    await open(5);
    let result: ReconnectDialogResultDetail | undefined;
    el.addEventListener('reconnect-dialog-result', (e: Event) => {
      result = (e as CustomEvent<ReconnectDialogResultDetail>).detail;
    });
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(result).toEqual({ reconnect: false });
  });

  it('does NOT fire on an outside click (misclick must not cancel)', async () => {
    await open(5);
    let fired = false;
    el.addEventListener('reconnect-dialog-result', () => {
      fired = true;
    });
    document.body.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    );
    expect(fired).toBe(false);
  });

  it('stops ticking after Cancel (no late expiry fire)', async () => {
    await open(3);
    const results: ReconnectDialogResultDetail[] = [];
    el.addEventListener('reconnect-dialog-result', (e: Event) => {
      results.push((e as CustomEvent<ReconnectDialogResultDetail>).detail);
    });
    (el.querySelector('button') as HTMLButtonElement).click();
    // Let what would have been the remaining countdown elapse.
    vi.advanceTimersByTime(5000);
    expect(results).toEqual([{ reconnect: false }]);
  });

  it('translates the title, body, and Cancel for the active language', async () => {
    el.language = 'de';
    await open(5);
    expect(el.querySelector('.fTelnetInfoDialogHeader')?.textContent).toContain(
      'Verbindung verloren',
    );
    expect(el.querySelector('button')?.textContent?.trim()).toBe('Abbrechen');
  });
});
