import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Color, Crt } from '@crt/index.js';
import { ContentAlignment } from '@crtcontrols/ContentAlignment.js';
import { CrtControl } from '@crtcontrols/CrtControl.js';
import { CrtLabel } from '@crtcontrols/CrtLabel.js';

describe('CrtLabel', () => {
  let container: HTMLDivElement;
  let crt: Crt;
  let parent: CrtControl;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    crt = new Crt(container, false);
    parent = new CrtControl(crt, undefined, 1, 1, 80, 25);
  });

  afterEach(() => {
    crt.dispose();
    document.body.removeChild(container);
  });

  function readRow(y: number, x: number, length: number): string {
    const snap = crt.SaveScreen(x, y, x + length - 1, y);
    return snap[0]!.map((c) => c.Ch).join('');
  }

  describe('construction', () => {
    it('always has Height 1', () => {
      const label = new CrtLabel(
        crt,
        parent,
        1,
        1,
        20,
        'Hi',
        ContentAlignment.Left,
        Color.WHITE,
        Color.BLACK
      );
      expect(label.Height).toBe(1);
    });

    it('stores the text', () => {
      const label = new CrtLabel(
        crt,
        parent,
        1,
        1,
        20,
        'Hello',
        ContentAlignment.Left,
        Color.WHITE,
        Color.BLACK
      );
      expect(label.Text).toBe('Hello');
    });

    it('stores the alignment', () => {
      const label = new CrtLabel(
        crt,
        parent,
        1,
        1,
        20,
        'Hi',
        ContentAlignment.Right,
        Color.WHITE,
        Color.BLACK
      );
      expect(label.TextAlign).toBe(ContentAlignment.Right);
    });
  });

  describe('Left alignment', () => {
    it('writes text at the leftmost cell and pads right with spaces', () => {
      new CrtLabel(
        crt,
        parent,
        1,
        1,
        10,
        'Hi',
        ContentAlignment.Left,
        Color.WHITE,
        Color.BLACK
      );
      expect(readRow(2, 2, 10)).toBe('Hi        ');
    });
  });

  describe('Right alignment', () => {
    it('writes text at the rightmost cells and pads left with spaces', () => {
      new CrtLabel(
        crt,
        parent,
        1,
        1,
        10,
        'Hi',
        ContentAlignment.Right,
        Color.WHITE,
        Color.BLACK
      );
      expect(readRow(2, 2, 10)).toBe('        Hi');
    });
  });

  describe('Center alignment', () => {
    it('centers a short string with even padding', () => {
      // "Hi" in width 10 → 4 spaces, "Hi", 4 spaces
      new CrtLabel(
        crt,
        parent,
        1,
        1,
        10,
        'Hi',
        ContentAlignment.Center,
        Color.WHITE,
        Color.BLACK
      );
      expect(readRow(2, 2, 10)).toBe('    Hi    ');
    });

    it('centers a string with odd padding (extra space on the right)', () => {
      // "Hi" in width 11 → 4 spaces, "Hi", 5 spaces (or vice versa)
      new CrtLabel(
        crt,
        parent,
        1,
        1,
        11,
        'Hi',
        ContentAlignment.Center,
        Color.WHITE,
        Color.BLACK
      );
      // Math.floor((11 - 2) / 2) = 4 → 4 left + Hi + 5 right
      expect(readRow(2, 2, 11)).toBe('    Hi     ');
    });

    it('truncates text wider than the label', () => {
      new CrtLabel(
        crt,
        parent,
        1,
        1,
        5,
        'TooLong',
        ContentAlignment.Center,
        Color.WHITE,
        Color.BLACK
      );
      expect(readRow(2, 2, 5)).toBe('TooLo');
    });

    /*
     * The original code had a real bug in the Center branch of
     * CrtLabel.Paint(): a nested `for` loop reused the outer loop's
     * `i` variable, so `Lines[i].length` inside the spacing
     * calculations referred to whatever line the inner loop had last
     * mutated `i` to. Multi-line centered labels would have very
     * wrong spacing on lines after the first.
     *
     * This test catches that bug — without the fix, the second line
     * would not be centered correctly (the spacing would be computed
     * from `Lines[indexOfLastSpacingChar].length` instead of
     * `Lines[lineNumber].length`).
     */
    it('centers each line of multi-line text independently (bug-fix regression)', () => {
      // Make a tall parent so the label can have height > 1
      const tallParent = new CrtControl(crt, undefined, 1, 10, 80, 5);
      const label = new CrtLabel(
        crt,
        tallParent,
        1,
        1,
        10,
        'A\nBBB',
        ContentAlignment.Center,
        Color.WHITE,
        Color.BLACK
      );
      label.Height = 2; // Allow two lines of output
      label.Paint(true);

      // Line 1: "A" (1 char) in width 10 → 4 spaces + "A" + 5 spaces
      // Line 2: "BBB" (3 chars) in width 10 → 3 spaces + "BBB" + 4 spaces
      // Each line is centered independently. Pre-fix, line 2's
      // spacing would have been computed from line 1's length, producing wrong output.
      expect(readRow(11, 2, 10)).toBe('    A     ');
      expect(readRow(12, 2, 10)).toBe('   BBB    ');
    });
  });

  describe('text replacement', () => {
    it('changing Text triggers a repaint', () => {
      const label = new CrtLabel(
        crt,
        parent,
        1,
        1,
        10,
        'First',
        ContentAlignment.Left,
        Color.WHITE,
        Color.BLACK
      );
      label.Text = 'Second';
      expect(readRow(2, 2, 10)).toBe('Second    ');
    });
  });

  describe('alignment switching', () => {
    it('changing TextAlign triggers a repaint', () => {
      const label = new CrtLabel(
        crt,
        parent,
        1,
        1,
        10,
        'X',
        ContentAlignment.Left,
        Color.WHITE,
        Color.BLACK
      );
      label.TextAlign = ContentAlignment.Right;
      expect(readRow(2, 2, 10)).toBe('         X');
    });

    it('setting TextAlign to the same value is a no-op', () => {
      const label = new CrtLabel(
        crt,
        parent,
        1,
        1,
        10,
        'X',
        ContentAlignment.Left,
        Color.WHITE,
        Color.BLACK
      );
      expect(() => {
        label.TextAlign = ContentAlignment.Left;
      }).not.toThrow();
    });
  });

  describe('CRLF in text', () => {
    it('treats \\r\\n the same as \\n for line splitting', () => {
      // We can't easily distinguish 1 vs 2 lines here without checking
      // a second row, but make sure both don't crash and produce
      // sensible output.
      const tallParent = new CrtControl(crt, undefined, 1, 10, 80, 5);
      const label = new CrtLabel(
        crt,
        tallParent,
        1,
        1,
        10,
        'A\r\nB',
        ContentAlignment.Left,
        Color.WHITE,
        Color.BLACK
      );
      label.Height = 2;
      label.Paint(true);
      expect(readRow(11, 2, 10)).toBe('A         ');
      expect(readRow(12, 2, 10)).toBe('B         ');
    });
  });
});
