import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Color, Crt } from '@crt/index.js';
import { BorderStyle } from '@crtcontrols/BorderStyle.js';
import { ContentAlignment } from '@crtcontrols/ContentAlignment.js';
import { CrtPanel } from '@crtcontrols/CrtPanel.js';

describe('CrtPanel', () => {
  let container: HTMLDivElement;
  let crt: Crt;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
  });

  function readCell(x: number, y: number): string {
    return crt.SaveScreen(x, y, x, y)[0]![0]!.Ch;
  }

  describe('border drawing — Single style', () => {
    it('draws CP437 218 at top-left corner', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      expect(readCell(5, 5)).toBe(String.fromCharCode(218));
    });

    it('draws CP437 191 at top-right corner', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      expect(readCell(14, 5)).toBe(String.fromCharCode(191));
    });

    it('draws CP437 192 at bottom-left corner', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      expect(readCell(5, 9)).toBe(String.fromCharCode(192));
    });

    it('draws CP437 217 at bottom-right corner', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      expect(readCell(14, 9)).toBe(String.fromCharCode(217));
    });

    it('draws CP437 196 along the top edge', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      // Between corners (5..14), cells 6..13 should be horizontal lines
      expect(readCell(7, 5)).toBe(String.fromCharCode(196));
    });

    it('draws CP437 179 along the side edges', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      // Middle row's left edge
      expect(readCell(5, 6)).toBe(String.fromCharCode(179));
      // Middle row's right edge
      expect(readCell(14, 6)).toBe(String.fromCharCode(179));
    });

    it('interior is filled with spaces', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      // Middle interior cell
      expect(readCell(7, 7)).toBe(' ');
    });
  });

  describe('border drawing — Double style', () => {
    it('uses CP437 201/187/200/188 for the four corners', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.Double,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      expect(readCell(5, 5)).toBe(String.fromCharCode(201));
      expect(readCell(14, 5)).toBe(String.fromCharCode(187));
      expect(readCell(5, 9)).toBe(String.fromCharCode(200));
      expect(readCell(14, 9)).toBe(String.fromCharCode(188));
    });

    it('uses CP437 205 for horizontal and 186 for vertical edges', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.Double,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      expect(readCell(7, 5)).toBe(String.fromCharCode(205));
      expect(readCell(5, 7)).toBe(String.fromCharCode(186));
    });
  });

  describe('border drawing — mixed styles', () => {
    it('DoubleH uses double horizontal (205), single vertical (179)', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.DoubleH,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      expect(readCell(7, 5)).toBe(String.fromCharCode(205));
      expect(readCell(5, 7)).toBe(String.fromCharCode(179));
    });

    it('DoubleV uses single horizontal (196), double vertical (186)', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.DoubleV,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      expect(readCell(7, 5)).toBe(String.fromCharCode(196));
      expect(readCell(5, 7)).toBe(String.fromCharCode(186));
    });

    it('SingleV is equivalent to DoubleH (same char set, different name)', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.SingleV,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      expect(readCell(7, 5)).toBe(String.fromCharCode(205));
      expect(readCell(5, 7)).toBe(String.fromCharCode(179));
    });

    it('SingleH is equivalent to DoubleV (same char set, different name)', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.SingleH,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      expect(readCell(7, 5)).toBe(String.fromCharCode(196));
      expect(readCell(5, 7)).toBe(String.fromCharCode(186));
    });
  });

  describe('title rendering', () => {
    function readTitleArea(y: number, x: number, length: number): string {
      const snap = crt.SaveScreen(x, y, x + length - 1, y);
      return snap[0]!.map((c) => c.Ch).join('');
    }

    it('wraps the title with spaces (so " Title " not "Title")', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        20,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        'Hi',
        ContentAlignment.TopLeft
      );
      // TopLeft → column ScreenLeft + 2 = 7
      expect(readTitleArea(5, 7, 4)).toBe(' Hi ');
    });

    it('TopCenter title is centered on the top edge', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        20,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        'Hi',
        ContentAlignment.TopCenter
      );
      // Title is " Hi " (4 chars), centered in width 20 starting at col 5
      // → starts at col 5 + round((20-4)/2) = 5 + 8 = 13
      expect(readTitleArea(5, 13, 4)).toBe(' Hi ');
    });

    it('TopRight title is right-aligned on the top edge', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        20,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        'Hi',
        ContentAlignment.TopRight
      );
      // " Hi " (4 chars), starts at col 5 + 20 - 4 - 2 = 19
      expect(readTitleArea(5, 19, 4)).toBe(' Hi ');
    });

    it('BottomCenter title is on the bottom edge', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        20,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        'Hi',
        ContentAlignment.BottomCenter
      );
      // Bottom edge is row 5 + 5 - 1 = 9
      expect(readTitleArea(9, 13, 4)).toBe(' Hi ');
    });

    it('empty title leaves the top edge fully drawn as horizontal lines', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        20,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      // No title characters should appear
      const topRow = readTitleArea(5, 5, 20);
      // First and last char are corners; middle 18 should be horizontal
      expect(topRow.charAt(0)).toBe(String.fromCharCode(218));
      expect(topRow.charAt(1)).toBe(String.fromCharCode(196));
      expect(topRow.charAt(19)).toBe(String.fromCharCode(191));
    });

    it('whitespace-only title is treated as empty (no title drawn)', () => {
      new CrtPanel(
        crt,
        undefined,
        5,
        5,
        20,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        '   ',
        ContentAlignment.TopCenter
      );
      // Top edge should be all horizontal lines
      const topRow = readTitleArea(5, 6, 18);
      expect(topRow).toBe(String.fromCharCode(196).repeat(18));
    });
  });

  describe('property setters', () => {
    it('changing Border triggers a repaint with the new chars', () => {
      const panel = new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      panel.Border = BorderStyle.Double;
      expect(readCell(5, 5)).toBe(String.fromCharCode(201));
    });

    it('changing Text updates the title', () => {
      const panel = new CrtPanel(
        crt,
        undefined,
        5,
        5,
        20,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        'A',
        ContentAlignment.TopCenter
      );
      panel.Text = 'B';
      // Title " B " is 3 chars, centered in width 20 starting at col 5
      // → col 5 + round((20-3)/2) = 5 + 9 = 14 (round(8.5) = 9? Actually 8 in JS — banker's rounding doesn't apply here, Math.round(8.5)=9)
      // Just check that ' B ' appears somewhere in the top row
      const topRow = crt
        .SaveScreen(5, 5, 24, 5)[0]!
        .map((c) => c.Ch)
        .join('');
      expect(topRow).toContain(' B ');
    });

    it('setting Border to the same value is a no-op', () => {
      const panel = new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.Single,
        Color.WHITE,
        Color.BLACK,
        '',
        ContentAlignment.TopCenter
      );
      expect(() => {
        panel.Border = BorderStyle.Single;
      }).not.toThrow();
    });

    it('exposes Border, Text, TextAlign getters', () => {
      const panel = new CrtPanel(
        crt,
        undefined,
        5,
        5,
        10,
        5,
        BorderStyle.Double,
        Color.WHITE,
        Color.BLACK,
        'X',
        ContentAlignment.MiddleLeft
      );
      expect(panel.Border).toBe(BorderStyle.Double);
      expect(panel.Text).toBe('X');
      expect(panel.TextAlign).toBe(ContentAlignment.MiddleLeft);
    });
  });
});
