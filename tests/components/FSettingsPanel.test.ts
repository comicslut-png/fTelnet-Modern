import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@components/FSettingsPanel.js';
import type {
  FSettingsPanel,
  SettingsDefaultProtocolChangeDetail,
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
      const soundFieldset = Array.from(
        el.querySelectorAll<HTMLFieldSetElement>('fieldset'),
      ).find((f) => f.querySelector('legend')?.textContent === 'Sound');
      const checkbox = soundFieldset!.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
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
    function getMuteCheckbox(): HTMLInputElement {
      const soundFieldset = Array.from(
        el.querySelectorAll<HTMLFieldSetElement>('fieldset'),
      ).find((f) => f.querySelector('legend')?.textContent === 'Sound');
      return soundFieldset!.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      )!;
    }

    it('changing muted updates the checkbox', async () => {
      el.muted = true;
      await el.updateComplete;
      const checkbox = getMuteCheckbox();
      expect(checkbox?.checked).toBe(true);
    });

    it('toggling the checkbox dispatches settings-mute-change', () => {
      const checkbox = getMuteCheckbox();

      let captured: SettingsMuteChangeDetail | undefined;
      el.addEventListener('settings-mute-change', (e): void => {
        captured = (e as CustomEvent<SettingsMuteChangeDetail>).detail;
      });

      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured?.muted).toBe(true);
    });

    it('un-muting also fires the event with muted=false', () => {
      const checkbox = getMuteCheckbox();

      const events: SettingsMuteChangeDetail[] = [];
      el.addEventListener('settings-mute-change', (e): void => {
        events.push((e as CustomEvent<SettingsMuteChangeDetail>).detail);
      });

      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

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

  describe('default protocol reactivity', () => {
    /**
     * The Protocol fieldset has two radios (ZMODEM / YMODEM) that
     * pick what the menu's Upload/Download buttons act on, and what
     * protocol's progress UI gets used. The change event propagates
     * the new value as a SettingsDefaultProtocolChangeDetail.
     */
    function getProtocolRadios(): {
      zmodem: HTMLInputElement;
      ymodem: HTMLInputElement;
    } {
      const radios = Array.from(
        el.querySelectorAll<HTMLInputElement>(
          'input[type="radio"][name="default-protocol"]',
        ),
      );
      const zmodem = radios.find((r) => r.value === 'zmodem')!;
      const ymodem = radios.find((r) => r.value === 'ymodem')!;
      return { zmodem, ymodem };
    }

    it('defaults to zmodem checked', () => {
      const { zmodem, ymodem } = getProtocolRadios();
      expect(zmodem.checked).toBe(true);
      expect(ymodem.checked).toBe(false);
    });

    it('lists ZModem first, then YModem (ZModem is the default)', () => {
      const radios = Array.from(
        el.querySelectorAll<HTMLInputElement>(
          'input[type="radio"][name="default-protocol"]',
        ),
      );
      // Two real protocol radios, ZModem first since it's the
      // default the menu acts on; YModem second as the legacy
      // fallback. (The disabled placeholder radio is in a separate
      // radio group and not matched by this selector.)
      expect(radios.length).toBe(2);
      expect(radios[0]!.value).toBe('zmodem');
      expect(radios[1]!.value).toBe('ymodem');
    });

    it('reflects the defaultProtocol property in the radios', async () => {
      el.defaultProtocol = 'ymodem';
      await el.updateComplete;
      const { zmodem, ymodem } = getProtocolRadios();
      expect(zmodem.checked).toBe(false);
      expect(ymodem.checked).toBe(true);
    });

    it('selecting ymodem dispatches settings-default-protocol-change with protocol=ymodem', () => {
      const { ymodem } = getProtocolRadios();

      let captured: SettingsDefaultProtocolChangeDetail | undefined;
      el.addEventListener('settings-default-protocol-change', (e): void => {
        captured = (
          e as CustomEvent<SettingsDefaultProtocolChangeDetail>
        ).detail;
      });

      ymodem.checked = true;
      ymodem.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ protocol: 'ymodem' });
    });

    it('selecting zmodem dispatches settings-default-protocol-change with protocol=zmodem', async () => {
      el.defaultProtocol = 'ymodem';
      await el.updateComplete;
      const { zmodem } = getProtocolRadios();

      let captured: SettingsDefaultProtocolChangeDetail | undefined;
      el.addEventListener('settings-default-protocol-change', (e): void => {
        captured = (
          e as CustomEvent<SettingsDefaultProtocolChangeDetail>
        ).detail;
      });

      zmodem.checked = true;
      zmodem.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ protocol: 'zmodem' });
    });
  });

  describe('language picker', () => {
    function getLanguageRadios(): HTMLInputElement[] {
      return Array.from(
        el.querySelectorAll<HTMLInputElement>(
          'input[type="radio"][name="language"]',
        ),
      );
    }

    it('renders a Language fieldset', () => {
      const langFieldset = Array.from(
        el.querySelectorAll<HTMLFieldSetElement>('fieldset'),
      ).find((f) => f.querySelector('legend')?.textContent?.trim() === 'Language');
      expect(langFieldset).toBeDefined();
    });

    it('renders the fifteen known languages with endonyms', () => {
      const radios = getLanguageRadios();
      const values = radios.map((r) => r.value);
      expect(values).toEqual([
        'en',
        'de',
        'fr',
        'es',
        'pt',
        'nl',
        'it',
        'ru',
        'sv',
        'pl',
        'uk',
        'fi',
        'el',
        'cs',
        'ja',
      ]);
    });

    it('Portuguese radio appears directly below Spanish', () => {
      const radios = getLanguageRadios();
      const values = radios.map((r) => r.value);
      const esIndex = values.indexOf('es');
      const ptIndex = values.indexOf('pt');
      expect(ptIndex).toBe(esIndex + 1);
    });

    it('Dutch radio appears directly below Portuguese', () => {
      const radios = getLanguageRadios();
      const values = radios.map((r) => r.value);
      const ptIndex = values.indexOf('pt');
      const nlIndex = values.indexOf('nl');
      expect(nlIndex).toBe(ptIndex + 1);
    });

    it('Italian radio appears directly below Dutch', () => {
      const radios = getLanguageRadios();
      const values = radios.map((r) => r.value);
      const nlIndex = values.indexOf('nl');
      const itIndex = values.indexOf('it');
      expect(itIndex).toBe(nlIndex + 1);
    });

    it('Russian radio appears directly below Italian', () => {
      const radios = getLanguageRadios();
      const values = radios.map((r) => r.value);
      const itIndex = values.indexOf('it');
      const ruIndex = values.indexOf('ru');
      expect(ruIndex).toBe(itIndex + 1);
    });

    it('Swedish radio appears directly below Russian', () => {
      const radios = getLanguageRadios();
      const values = radios.map((r) => r.value);
      const ruIndex = values.indexOf('ru');
      const svIndex = values.indexOf('sv');
      expect(svIndex).toBe(ruIndex + 1);
    });

    it('Polish radio appears directly below Swedish', () => {
      const radios = getLanguageRadios();
      const values = radios.map((r) => r.value);
      const svIndex = values.indexOf('sv');
      const plIndex = values.indexOf('pl');
      expect(plIndex).toBe(svIndex + 1);
    });

    it('Ukrainian radio appears directly below Polish', () => {
      const radios = getLanguageRadios();
      const values = radios.map((r) => r.value);
      const plIndex = values.indexOf('pl');
      const ukIndex = values.indexOf('uk');
      expect(ukIndex).toBe(plIndex + 1);
    });

    it('Finnish radio appears directly below Ukrainian', () => {
      const radios = getLanguageRadios();
      const values = radios.map((r) => r.value);
      const ukIndex = values.indexOf('uk');
      const fiIndex = values.indexOf('fi');
      expect(fiIndex).toBe(ukIndex + 1);
    });

    it('Greek radio appears directly below Finnish', () => {
      const radios = getLanguageRadios();
      const values = radios.map((r) => r.value);
      const fiIndex = values.indexOf('fi');
      const elIndex = values.indexOf('el');
      expect(elIndex).toBe(fiIndex + 1);
    });

    it('Czech radio appears directly below Greek', () => {
      const radios = getLanguageRadios();
      const values = radios.map((r) => r.value);
      const elIndex = values.indexOf('el');
      const csIndex = values.indexOf('cs');
      expect(csIndex).toBe(elIndex + 1);
    });

    it('Japanese radio appears directly below Czech', () => {
      const radios = getLanguageRadios();
      const values = radios.map((r) => r.value);
      const csIndex = values.indexOf('cs');
      const jaIndex = values.indexOf('ja');
      expect(jaIndex).toBe(csIndex + 1);
    });

    it('all fifteen languages are enabled (none disabled)', () => {
      const radios = getLanguageRadios();
      const byValue = (v: string): HTMLInputElement =>
        radios.find((r) => r.value === v)!;
      expect(byValue('en').disabled).toBe(false);
      expect(byValue('de').disabled).toBe(false);
      expect(byValue('fr').disabled).toBe(false);
      expect(byValue('es').disabled).toBe(false);
      expect(byValue('pt').disabled).toBe(false);
      expect(byValue('nl').disabled).toBe(false);
      expect(byValue('it').disabled).toBe(false);
      expect(byValue('ru').disabled).toBe(false);
      expect(byValue('sv').disabled).toBe(false);
      expect(byValue('pl').disabled).toBe(false);
      expect(byValue('uk').disabled).toBe(false);
      expect(byValue('fi').disabled).toBe(false);
      expect(byValue('el').disabled).toBe(false);
      expect(byValue('cs').disabled).toBe(false);
      expect(byValue('ja').disabled).toBe(false);
    });

    it('reflects the language property in the checked radio', async () => {
      el.language = 'de';
      await el.updateComplete;
      const radios = getLanguageRadios();
      const de = radios.find((r) => r.value === 'de')!;
      const en = radios.find((r) => r.value === 'en')!;
      expect(de.checked).toBe(true);
      expect(en.checked).toBe(false);
    });

    it('renders no "Other" placeholder radios (removed in beta.17)', () => {
      const others = Array.from(
        el.querySelectorAll<HTMLInputElement>(
          'input[type="radio"][name="language-other"]',
        ),
      );
      expect(others.length).toBe(0);
    });

    it('selecting German dispatches settings-language-change with language=de', () => {
      const radios = getLanguageRadios();
      const de = radios.find((r) => r.value === 'de')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      de.checked = true;
      de.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'de' });
    });

    it('selecting French dispatches settings-language-change with language=fr', () => {
      const radios = getLanguageRadios();
      const fr = radios.find((r) => r.value === 'fr')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      fr.checked = true;
      fr.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'fr' });
    });

    it('selecting Spanish dispatches settings-language-change with language=es', () => {
      const radios = getLanguageRadios();
      const es = radios.find((r) => r.value === 'es')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      es.checked = true;
      es.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'es' });
    });

    it('selecting Portuguese dispatches settings-language-change with language=pt', () => {
      const radios = getLanguageRadios();
      const pt = radios.find((r) => r.value === 'pt')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      pt.checked = true;
      pt.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'pt' });
    });

    it('selecting Dutch dispatches settings-language-change with language=nl', () => {
      const radios = getLanguageRadios();
      const nl = radios.find((r) => r.value === 'nl')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      nl.checked = true;
      nl.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'nl' });
    });

    it('selecting Italian dispatches settings-language-change with language=it', () => {
      const radios = getLanguageRadios();
      const it = radios.find((r) => r.value === 'it')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      it.checked = true;
      it.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'it' });
    });

    it('selecting Russian dispatches settings-language-change with language=ru', () => {
      const radios = getLanguageRadios();
      const ru = radios.find((r) => r.value === 'ru')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      ru.checked = true;
      ru.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'ru' });
    });

    it('selecting Swedish dispatches settings-language-change with language=sv', () => {
      const radios = getLanguageRadios();
      const sv = radios.find((r) => r.value === 'sv')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      sv.checked = true;
      sv.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'sv' });
    });

    it('selecting Polish dispatches settings-language-change with language=pl', () => {
      const radios = getLanguageRadios();
      const pl = radios.find((r) => r.value === 'pl')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      pl.checked = true;
      pl.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'pl' });
    });

    it('selecting Ukrainian dispatches settings-language-change with language=uk', () => {
      const radios = getLanguageRadios();
      const uk = radios.find((r) => r.value === 'uk')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      uk.checked = true;
      uk.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'uk' });
    });

    it('selecting Finnish dispatches settings-language-change with language=fi', () => {
      const radios = getLanguageRadios();
      const fi = radios.find((r) => r.value === 'fi')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      fi.checked = true;
      fi.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'fi' });
    });

    it('selecting Greek dispatches settings-language-change with language=el', () => {
      const radios = getLanguageRadios();
      const el2 = radios.find((r) => r.value === 'el')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      el2.checked = true;
      el2.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'el' });
    });

    it('selecting Czech dispatches settings-language-change with language=cs', () => {
      const radios = getLanguageRadios();
      const cs = radios.find((r) => r.value === 'cs')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      cs.checked = true;
      cs.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'cs' });
    });

    it('selecting Japanese dispatches settings-language-change with language=ja', () => {
      const radios = getLanguageRadios();
      const ja = radios.find((r) => r.value === 'ja')!;

      let captured: { language: string } | undefined;
      el.addEventListener('settings-language-change', (e): void => {
        captured = (e as CustomEvent<{ language: string }>).detail;
      });

      ja.checked = true;
      ja.dispatchEvent(new Event('change', { bubbles: true }));

      expect(captured).toEqual({ language: 'ja' });
    });

    it('splits languages into three columns of at most 5 (no Other column)', () => {
      const langCols = el.querySelectorAll(
        '.fTelnetSettingsPanelLanguageColumn',
      );
      // 15 functional languages chunked 5-per-column = 3 full
      // language columns (5 + 5 + 5). The "Other" placeholder column
      // was removed in beta.17, so there are exactly 3 columns now.
      expect(langCols.length).toBe(3);
    });

    it('chunks languages 5/5/5 across three full language columns', () => {
      const cols = Array.from(
        el.querySelectorAll('.fTelnetSettingsPanelLanguageColumn'),
      );
      const realRadios = (col: Element): HTMLInputElement[] =>
        Array.from(
          col.querySelectorAll<HTMLInputElement>(
            'input[type="radio"][name="language"]',
          ),
        );
      // Column 1: en/de/fr/es/pt (5). Column 2: nl/it/ru/sv/pl (5).
      // Column 3: uk/fi/el/cs/ja (5) — now full.
      expect(realRadios(cols[0]!).map((r) => r.value)).toEqual([
        'en',
        'de',
        'fr',
        'es',
        'pt',
      ]);
      expect(realRadios(cols[1]!).map((r) => r.value)).toEqual([
        'nl',
        'it',
        'ru',
        'sv',
        'pl',
      ]);
      expect(realRadios(cols[2]!).map((r) => r.value)).toEqual([
        'uk',
        'fi',
        'el',
        'cs',
        'ja',
      ]);
    });

    it('no language column exceeds 5 entries', () => {
      const cols = Array.from(
        el.querySelectorAll('.fTelnetSettingsPanelLanguageColumn'),
      );
      for (const col of cols) {
        const radios = col.querySelectorAll('input[type="radio"]');
        expect(radios.length).toBeLessThanOrEqual(5);
      }
    });

    it('every column contains only real (enabled) language radios', () => {
      // After removing the Other placeholders, there should be no
      // disabled radios anywhere in the language fieldset.
      const disabled = el.querySelectorAll(
        '.fTelnetSettingsPanelLanguageColumns input[type="radio"]:disabled',
      );
      expect(disabled.length).toBe(0);
    });
  });

  describe('localization of panel labels', () => {
    it('shows English legends by default', () => {
      const legends = Array.from(el.querySelectorAll('legend')).map((l) =>
        l.textContent?.trim(),
      );
      expect(legends).toContain('Theme');
      expect(legends).toContain('Protocol');
      expect(legends).toContain('Language');
      expect(legends).toContain('Sound');
      expect(legends).toContain('Touch');
      expect(legends).toContain('About');
    });

    it('switches panel labels to German when language="de"', async () => {
      el.language = 'de';
      await el.updateComplete;
      const legends = Array.from(el.querySelectorAll('legend')).map((l) =>
        l.textContent?.trim(),
      );
      expect(legends).toContain('Design');
      expect(legends).toContain('Protokoll');
      expect(legends).toContain('Sprache');
      expect(legends).toContain('Ton');
      expect(legends).toContain('Über');
      expect(legends).not.toContain('Theme');
    });

    it('localizes the header and close button', async () => {
      el.language = 'de';
      await el.updateComplete;
      const header = el.querySelector('.fTelnetSettingsPanelHeader');
      const close = el.querySelector('.fTelnetSettingsPanelClose');
      expect(header?.textContent?.trim()).toBe('Einstellungen');
      expect(close?.textContent?.trim()).toBe('Schließen');
    });

    it('language names are endonyms regardless of active language', () => {
      const radios = Array.from(
        el.querySelectorAll<HTMLInputElement>(
          'input[type="radio"][name="language"]',
        ),
      );
      const labels = radios.map((r) => r.parentElement?.textContent?.trim());
      expect(labels).toContain('English');
      expect(labels).toContain('Deutsch');
      expect(labels).toContain('Français');
      expect(labels).toContain('Español');
      expect(labels).toContain('Português');
      expect(labels).toContain('Nederlands');
      expect(labels).toContain('Italiano');
      expect(labels).toContain('Русский');
      expect(labels).toContain('Svenska');
      expect(labels).toContain('Polski');
      expect(labels).toContain('Українська');
      expect(labels).toContain('Suomi');
      expect(labels).toContain('Ελληνικά');
      expect(labels).toContain('Čeština');
      expect(labels).toContain('日本語');
    });

    it('removes the emoji icons from option labels', () => {
      const text = el.textContent ?? '';
      expect(text).not.toContain('🎨');
      expect(text).not.toContain('📡');
      expect(text).not.toContain('📼');
      expect(text).not.toContain('🔍');
      expect(text).not.toContain('🔇');
      expect(text).not.toContain('📳');
    });
  });

  describe('two-row grid layout', () => {
    /**
     * Phase 5 (beta.6): panel is a two-row grid, three columns per
     * row:
     *   Row 1:  Theme | Protocol | Language (wide)
     *   Row 2:  Sound | Touch    | placeholder (wide)
     * About spans full width below. Tests verify the row/column
     * structure, the column order, and the placeholder in row 2.
     */
    it('renders two .fTelnetSettingsPanelColumns rows', () => {
      const rows = el.querySelectorAll('.fTelnetSettingsPanelColumns');
      expect(rows.length).toBe(2);
    });

    it('renders six columns total (three per row)', () => {
      const cols = el.querySelectorAll('.fTelnetSettingsPanelColumn');
      expect(cols.length).toBe(6);
    });

    it('row 1 order is Theme | Protocol | Language', () => {
      const rows = Array.from(
        el.querySelectorAll('.fTelnetSettingsPanelColumns'),
      );
      const row1Cols = Array.from(
        rows[0]!.querySelectorAll('.fTelnetSettingsPanelColumn'),
      );
      const legends = row1Cols.map(
        (c) => c.querySelector('legend')?.textContent?.trim(),
      );
      expect(legends).toEqual(['Theme', 'Protocol', 'Language']);
    });

    it('row 2 order is Sound | Touch | (placeholder)', () => {
      const rows = Array.from(
        el.querySelectorAll('.fTelnetSettingsPanelColumns'),
      );
      const row2Cols = Array.from(
        rows[1]!.querySelectorAll('.fTelnetSettingsPanelColumn'),
      );
      const soundLegend = row2Cols[0]!.querySelector('legend')?.textContent?.trim();
      const touchLegend = row2Cols[1]!.querySelector('legend')?.textContent?.trim();
      // Third column is the placeholder fieldset — no legend.
      const placeholder = row2Cols[2]!.querySelector('fieldset');

      expect(soundLegend).toBe('Sound');
      expect(touchLegend).toBe('Touch');
      expect(placeholder?.querySelector('legend')).toBeNull();
      expect(
        placeholder?.classList.contains('fTelnetSettingsPanelGroupReserved'),
      ).toBe(true);
    });

    it('the Language column is the wide column in row 1', () => {
      const rows = Array.from(
        el.querySelectorAll('.fTelnetSettingsPanelColumns'),
      );
      const row1Cols = Array.from(
        rows[0]!.querySelectorAll('.fTelnetSettingsPanelColumn'),
      );
      const langCol = row1Cols[2]!;
      expect(
        langCol.classList.contains('fTelnetSettingsPanelColumnWide'),
      ).toBe(true);
    });

    it('the placeholder in row 2 is empty and bordered', () => {
      const rows = Array.from(
        el.querySelectorAll('.fTelnetSettingsPanelColumns'),
      );
      const row2Cols = Array.from(
        rows[1]!.querySelectorAll('.fTelnetSettingsPanelColumn'),
      );
      const placeholder = row2Cols[2]!.querySelector('fieldset')!;
      expect(placeholder.children.length).toBe(0);
      expect(
        placeholder.classList.contains('fTelnetSettingsPanelGroupReserved'),
      ).toBe(true);
    });

    it('Protocol column has a "Default" sub-header above the radios', () => {
      const protocolFieldset = Array.from(
        el.querySelectorAll<HTMLFieldSetElement>('fieldset'),
      ).find((f) => f.querySelector('legend')?.textContent === 'Protocol');
      const subheader = protocolFieldset!.querySelector(
        '.fTelnetSettingsPanelSubheader',
      );
      expect(subheader?.textContent?.trim()).toBe('Default');
    });

    it('Protocol column has a placeholder radio (disabled, separate group)', () => {
      const protocolFieldset = Array.from(
        el.querySelectorAll<HTMLFieldSetElement>('fieldset'),
      ).find((f) => f.querySelector('legend')?.textContent === 'Protocol');

      const allRadios = Array.from(
        protocolFieldset!.querySelectorAll<HTMLInputElement>(
          'input[type="radio"]',
        ),
      );
      // 3 radios total: ymodem, zmodem, placeholder
      expect(allRadios.length).toBe(3);

      const placeholder = allRadios.find((r) => r.disabled);
      expect(placeholder).toBeDefined();
      // Placeholder must NOT share the default-protocol radio group
      // — otherwise clicking it (even disabled) could deselect the
      // active protocol on browsers that allow keyboard focus.
      expect(placeholder!.name).not.toBe('default-protocol');
    });

    it('Protocol column has a divider before Auto Detect', () => {
      const protocolFieldset = Array.from(
        el.querySelectorAll<HTMLFieldSetElement>('fieldset'),
      ).find((f) => f.querySelector('legend')?.textContent === 'Protocol');
      const divider = protocolFieldset!.querySelector(
        '.fTelnetSettingsPanelDivider',
      );
      expect(divider).not.toBeNull();
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
