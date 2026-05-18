import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@components/FSettingsPanel.js';
import type {
  FSettingsPanel,
  SettingsMuteChangeDetail,
  SettingsThemeChangeDetail,
  SettingsVibrateChangeDetail,
  SettingsZModemAutoDetectChangeDetail,
} from '@components/index.js';

/*
  Tests for <f-settings-panel>.

  Phase 3 Stage 2's user-facing settings UI. Covers:
    - Default state + DOM shape
    - Reactive properties: open, currentTheme, muted, vibrateDuration
    - Each control's change event (theme radio, mute checkbox,
      vibrate number)
    - Close button event
    - Positioning logic
    - Multi-instance independence
*/

describe('<f-settings-panel>', () => {
  let container: HTMLDivElement;
  let el: FSettingsPanel;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    el = document.createElement('f-settings-panel') as FSettingsPanel;
    container.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('default state', () => {
    it('registers as a custom element', () => {
      expect(customElements.get('f-settings-panel')).toBeDefined();
    });

    it('has sensible defaults', () => {
      expect(el.open).toBe(false);
      expect(el.currentTheme).toBe('classic');
      expect(el.muted).toBe(false);
      expect(el.vibrateDuration).toBe(25);
      expect(el.themes.length).toBe(6);
    });

    it('renders an inner panel with the CSS class', () => {
      expect(el.querySelector('.fTelnetSettingsPanel')).not.toBeNull();
    });

    it('starts hidden', () => {
      const inner = el.querySelector<HTMLElement>('.fTelnetSettingsPanel');
      expect(inner?.getAttribute('style') ?? '').toContain('display: none');
    });

    it('renders theme radio buttons', () => {
      const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"][name="theme"]');
      expect(radios.length).toBe(6);
      expect(radios[0]?.value).toBe('classic');
      expect(radios[1]?.value).toBe('dos-classic');
      expect(radios[2]?.value).toBe('crt-green');
      expect(radios[3]?.value).toBe('cyberpunk');
      expect(radios[4]?.value).toBe('gothic');
      expect(radios[5]?.value).toBe('cartoon');
    });

    it('the current theme radio is checked', () => {
      const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"][name="theme"]');
      expect(radios[0]?.checked).toBe(true);  // classic is current
      // None of the others are checked
      for (let i = 1; i < radios.length; i++) {
        expect(radios[i]?.checked).toBe(false);
      }
    });

    it('renders the mute checkbox unchecked', () => {
      const checkbox = el.querySelector<HTMLInputElement>('input[type="checkbox"]');
      expect(checkbox?.checked).toBe(false);
    });

    it('renders the vibrate number input with default value', () => {
      const numberInput = el.querySelector<HTMLInputElement>('input[type="number"]');
      expect(numberInput?.value).toBe('25');
    });

    it('renders a close button', () => {
      const close = el.querySelector('.fTelnetSettingsPanelClose');
      expect(close).not.toBeNull();
    });
  });

  describe('visibility', () => {
    it('open=true removes display:none', async () => {
      el.open = true;
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetSettingsPanel');
      expect(inner?.getAttribute('style') ?? '').not.toContain('display: none');
    });

    it('renders viewport-centered when open (ignores pageX/pageY)', async () => {
      // Phase 5 polish: positioning model changed from
      // pageX/pageY anchor to viewport-centered modal-style
      // overlay. The pageX/pageY props are kept for API
      // compatibility but no longer affect rendered position;
      // the panel always centers itself in the viewport.
      el.pageX = 300;
      el.pageY = 500;
      el.open = true;
      await el.updateComplete;
      const inner = el.querySelector<HTMLElement>('.fTelnetSettingsPanel');
      const style = inner?.getAttribute('style') ?? '';
      // Should center via top/left 50% + translate(-50%, -50%).
      expect(style).toContain('position: fixed');
      expect(style).toContain('top: 50%');
      expect(style).toContain('left: 50%');
      expect(style).toContain('translate(-50%, -50%)');
      // Old pageX/pageY pixel values should NOT appear.
      expect(style).not.toContain('left: 300px');
      expect(style).not.toContain('top: 500px');
    });
  });

  describe('click-outside-to-close', () => {
    it('clicking outside the panel closes it', async () => {
      el.open = true;
      await el.updateComplete;
      await Promise.resolve();

      const event = new MouseEvent('mousedown', { bubbles: true });
      document.body.dispatchEvent(event);

      expect(el.open).toBe(false);
    });

    it('clicking inside the panel does not close it', async () => {
      el.open = true;
      await el.updateComplete;
      await Promise.resolve();

      const inner = el.querySelector<HTMLElement>('.fTelnetSettingsPanel');
      const event = new MouseEvent('mousedown', { bubbles: true });
      inner?.dispatchEvent(event);

      expect(el.open).toBe(true);
    });

    it('dispatches settings-close event when closed by outside click', async () => {
      el.open = true;
      await el.updateComplete;
      await Promise.resolve();

      let closeFired = false;
      el.addEventListener('settings-close', () => {
        closeFired = true;
      });

      const event = new MouseEvent('mousedown', { bubbles: true });
      document.body.dispatchEvent(event);

      expect(closeFired).toBe(true);
    });
  });

  describe('theme reactivity', () => {
    it('changing currentTheme updates the radio "checked" state', async () => {
      el.currentTheme = 'dos-classic';
      await el.updateComplete;
      const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"][name="theme"]');
      expect(radios[0]?.checked).toBe(false);
      expect(radios[1]?.checked).toBe(true);
    });

    it('clicking a radio dispatches settings-theme-change with the chosen theme', () => {
      const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"][name="theme"]');
      const dosRadio = radios[1]!;

      let captured: SettingsThemeChangeDetail | undefined;
      el.addEventListener('settings-theme-change', (e): void => {
        captured = (e as CustomEvent<SettingsThemeChangeDetail>).detail;
      });

      dosRadio.checked = true;
      dosRadio.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured?.theme).toBe('dos-classic');
    });

    it('event bubbles and is composed', () => {
      const radio = el.querySelector<HTMLInputElement>('input[type="radio"]');

      let captured: Event | undefined;
      el.addEventListener('settings-theme-change', (e) => {
        captured = e;
      });

      radio!.dispatchEvent(new Event('change', { bubbles: true }));
      expect(captured?.bubbles).toBe(true);
      expect(captured?.composed).toBe(true);
    });
  });

  describe('mute reactivity', () => {
    it('changing muted updates the checkbox', async () => {
      el.muted = true;
      await el.updateComplete;
      const checkbox = el.querySelector<HTMLInputElement>('input[type="checkbox"]');
      expect(checkbox?.checked).toBe(true);
    });

    it('toggling the checkbox dispatches settings-mute-change', () => {
      const checkbox = el.querySelector<HTMLInputElement>('input[type="checkbox"]');

      let captured: SettingsMuteChangeDetail | undefined;
      el.addEventListener('settings-mute-change', (e): void => {
        captured = (e as CustomEvent<SettingsMuteChangeDetail>).detail;
      });

      checkbox!.checked = true;
      checkbox!.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured?.muted).toBe(true);
    });

    it('un-muting also fires the event with muted=false', () => {
      const checkbox = el.querySelector<HTMLInputElement>('input[type="checkbox"]');

      const events: SettingsMuteChangeDetail[] = [];
      el.addEventListener('settings-mute-change', (e): void => {
        events.push((e as CustomEvent<SettingsMuteChangeDetail>).detail);
      });

      checkbox!.checked = true;
      checkbox!.dispatchEvent(new Event('change', { bubbles: true }));
      checkbox!.checked = false;
      checkbox!.dispatchEvent(new Event('change', { bubbles: true }));

      expect(events).toEqual([{ muted: true }, { muted: false }]);
    });
  });

  describe('vibrate reactivity', () => {
    it('changing vibrateDuration updates the number input value', async () => {
      el.vibrateDuration = 50;
      await el.updateComplete;
      const numberInput = el.querySelector<HTMLInputElement>('input[type="number"]');
      expect(numberInput?.value).toBe('50');
    });

    it('changing the number input dispatches settings-vibrate-change', () => {
      const numberInput = el.querySelector<HTMLInputElement>('input[type="number"]');

      let captured: SettingsVibrateChangeDetail | undefined;
      el.addEventListener('settings-vibrate-change', (e): void => {
        captured = (e as CustomEvent<SettingsVibrateChangeDetail>).detail;
      });

      numberInput!.value = '50';
      numberInput!.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured?.duration).toBe(50);
    });

    it('clamps values above 100 to 100', () => {
      const numberInput = el.querySelector<HTMLInputElement>('input[type="number"]');

      let captured: SettingsVibrateChangeDetail | undefined;
      el.addEventListener('settings-vibrate-change', (e): void => {
        captured = (e as CustomEvent<SettingsVibrateChangeDetail>).detail;
      });

      numberInput!.value = '500';
      numberInput!.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured?.duration).toBe(100);
    });

    it('clamps negative values to 0', () => {
      const numberInput = el.querySelector<HTMLInputElement>('input[type="number"]');

      let captured: SettingsVibrateChangeDetail | undefined;
      el.addEventListener('settings-vibrate-change', (e): void => {
        captured = (e as CustomEvent<SettingsVibrateChangeDetail>).detail;
      });

      numberInput!.value = '-10';
      numberInput!.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured?.duration).toBe(0);
    });

    it('ignores non-numeric input', () => {
      const numberInput = el.querySelector<HTMLInputElement>('input[type="number"]');

      let fired = 0;
      el.addEventListener('settings-vibrate-change', () => fired++);

      // jsdom keeps invalid value as empty string on type=number
      numberInput!.value = 'abc';
      numberInput!.dispatchEvent(new Event('change', { bubbles: true }));

      // Empty value parses to NaN; handler bails without dispatching.
      expect(fired).toBe(0);
    });
  });

  describe('zmodem auto-detect reactivity', () => {
    /**
     * The Protocol → Auto Detect checkbox toggles
     * Options.ZModemAutoDetect at runtime. The change event
     * propagates the new value as a SettingsZModemAutoDetectChangeDetail.
     */
    it('defaults to enabled (checked)', () => {
      const checkboxes = el.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      // Three checkboxes: mute, (none for vibrate which is number), auto-detect
      // Find the one in the Protocol fieldset
      const protocolFieldset = Array.from(
        el.querySelectorAll<HTMLFieldSetElement>('fieldset'),
      ).find((f) => f.querySelector('legend')?.textContent === 'Protocol');
      expect(protocolFieldset).toBeTruthy();
      const checkbox = protocolFieldset!.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      expect(checkbox?.checked).toBe(true);
    });

    it('reflects the zmodemAutoDetect property in the checkbox state', async () => {
      el.zmodemAutoDetect = false;
      await el.updateComplete;
      const protocolFieldset = Array.from(
        el.querySelectorAll<HTMLFieldSetElement>('fieldset'),
      ).find((f) => f.querySelector('legend')?.textContent === 'Protocol');
      const checkbox = protocolFieldset!.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      expect(checkbox?.checked).toBe(false);
    });

    it('unchecking dispatches settings-zmodem-auto-detect-change with enabled=false', () => {
      const protocolFieldset = Array.from(
        el.querySelectorAll<HTMLFieldSetElement>('fieldset'),
      ).find((f) => f.querySelector('legend')?.textContent === 'Protocol');
      const checkbox = protocolFieldset!.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );

      let captured: SettingsZModemAutoDetectChangeDetail | undefined;
      el.addEventListener(
        'settings-zmodem-auto-detect-change',
        (e): void => {
          captured = (
            e as CustomEvent<SettingsZModemAutoDetectChangeDetail>
          ).detail;
        },
      );

      checkbox!.checked = false;
      checkbox!.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ enabled: false });
    });

    it('checking again dispatches with enabled=true', async () => {
      el.zmodemAutoDetect = false;
      await el.updateComplete;
      const protocolFieldset = Array.from(
        el.querySelectorAll<HTMLFieldSetElement>('fieldset'),
      ).find((f) => f.querySelector('legend')?.textContent === 'Protocol');
      const checkbox = protocolFieldset!.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );

      let captured: SettingsZModemAutoDetectChangeDetail | undefined;
      el.addEventListener(
        'settings-zmodem-auto-detect-change',
        (e): void => {
          captured = (
            e as CustomEvent<SettingsZModemAutoDetectChangeDetail>
          ).detail;
        },
      );

      checkbox!.checked = true;
      checkbox!.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ enabled: true });
    });
  });

  describe('close button', () => {
    it('clicking close dispatches settings-close event', () => {
      const close = el.querySelector<HTMLAnchorElement>('.fTelnetSettingsPanelClose');

      let fired = 0;
      el.addEventListener('settings-close', () => fired++);

      close!.click();
      expect(fired).toBe(1);
    });

    it('calls preventDefault on the click', () => {
      const close = el.querySelector<HTMLAnchorElement>('.fTelnetSettingsPanelClose');
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      close!.dispatchEvent(click);
      expect(click.defaultPrevented).toBe(true);
    });
  });

  describe('multiple instances', () => {
    it('two panels dispatch their own events independently', async () => {
      const second = document.createElement('f-settings-panel') as FSettingsPanel;
      container.appendChild(second);
      await second.updateComplete;

      let firstFired = 0;
      let secondFired = 0;
      el.addEventListener('settings-close', () => firstFired++);
      second.addEventListener('settings-close', () => secondFired++);

      el.querySelector<HTMLAnchorElement>('.fTelnetSettingsPanelClose')!.click();
      second.querySelector<HTMLAnchorElement>('.fTelnetSettingsPanelClose')!.click();

      expect(firstFired).toBe(1);
      expect(secondFired).toBe(1);
    });
  });
});
