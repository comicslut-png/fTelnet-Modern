import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@components/FDropOverlay.js';
import type {
  FDropOverlay,
  DropFileSelectedDetail,
} from '@components/index.js';

/*
  Tests for <f-drop-overlay>.

  Phase 5 Upload UI sub-project, Delta 1.

  The overlay listens for document-level drag events. We can drive
  it in jsdom by dispatching DragEvent-shaped events on document
  with `dataTransfer.types` indicating 'Files' and `dataTransfer.files`
  carrying a File-like object.

  Coverage:
    - Default state (not visible, enabled)
    - dragenter with files makes it visible
    - dragenter without files does nothing
    - drop dispatches drop-file-selected with the file
    - drop with no files is a no-op
    - dragleave (depth back to zero) hides the overlay
    - enabled=false suppresses all drag handling
*/

/**
 * Helper: build a fake DragEvent shape that jsdom accepts. jsdom
 * doesn't fully implement DataTransfer, so we craft an object with
 * just the properties FDropOverlay reads.
 */
function makeDragEvent(
  type: string,
  options: { hasFiles?: boolean; files?: File[] } = {},
): DragEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
  const dt = {
    types: options.hasFiles ? ['Files'] : [],
    files: (options.files ?? []) as unknown as FileList,
    dropEffect: 'none',
  };
  Object.defineProperty(event, 'dataTransfer', {
    value: dt,
    writable: false,
  });
  return event;
}

describe('<f-drop-overlay>', () => {
  let el: FDropOverlay;

  beforeEach(async () => {
    el = document.createElement('f-drop-overlay') as FDropOverlay;
    document.body.appendChild(el);
    await el.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(el);
  });

  describe('default state', () => {
    it('is invisible and enabled', () => {
      expect(el.visible).toBe(false);
      expect(el.enabled).toBe(true);
    });

    it('renders no overlay when not visible', () => {
      expect(el.querySelector('.fTelnetDropOverlay')).toBeNull();
    });
  });

  describe('drag enter / over / leave', () => {
    it('dragenter with files makes overlay visible', async () => {
      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      await el.updateComplete;
      expect(el.visible).toBe(true);
      expect(el.querySelector('.fTelnetDropOverlay')).not.toBeNull();
    });

    it('dragenter without files does not show the overlay', async () => {
      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: false }));
      await el.updateComplete;
      expect(el.visible).toBe(false);
    });

    it('dragleave matching dragenter hides the overlay', async () => {
      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      await el.updateComplete;
      expect(el.visible).toBe(true);

      document.dispatchEvent(makeDragEvent('dragleave', { hasFiles: true }));
      await el.updateComplete;
      expect(el.visible).toBe(false);
    });

    it('nested dragenter/dragleave pairs do not flicker the overlay', async () => {
      // Two enters (e.g., entering outer then inner element)
      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      await el.updateComplete;
      expect(el.visible).toBe(true);

      // One leave — should stay visible (still inside the outer)
      document.dispatchEvent(makeDragEvent('dragleave', { hasFiles: true }));
      await el.updateComplete;
      expect(el.visible).toBe(true);

      // Second leave — now actually leaving
      document.dispatchEvent(makeDragEvent('dragleave', { hasFiles: true }));
      await el.updateComplete;
      expect(el.visible).toBe(false);
    });
  });

  describe('drop', () => {
    it('drop dispatches drop-file-selected with the first file', async () => {
      const fakeFile = new File(['hello'], 'hello.txt', {
        type: 'text/plain',
      });

      let captured: DropFileSelectedDetail | undefined;
      el.addEventListener('drop-file-selected', (e): void => {
        captured = (e as CustomEvent<DropFileSelectedDetail>).detail;
      });

      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      document.dispatchEvent(
        makeDragEvent('drop', { hasFiles: true, files: [fakeFile] }),
      );
      await el.updateComplete;

      expect(captured).toBeDefined();
      expect(captured?.file.name).toBe('hello.txt');
      expect(el.visible).toBe(false);
    });

    it('drop with multiple files takes only the first', async () => {
      const f1 = new File(['a'], 'a.txt');
      const f2 = new File(['b'], 'b.txt');

      let captured: DropFileSelectedDetail | undefined;
      el.addEventListener('drop-file-selected', (e): void => {
        captured = (e as CustomEvent<DropFileSelectedDetail>).detail;
      });

      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      document.dispatchEvent(
        makeDragEvent('drop', { hasFiles: true, files: [f1, f2] }),
      );

      expect(captured?.file.name).toBe('a.txt');
    });

    it('drop with no files does not dispatch', async () => {
      let fired = 0;
      el.addEventListener('drop-file-selected', () => fired++);

      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      document.dispatchEvent(makeDragEvent('drop', { hasFiles: true }));

      expect(fired).toBe(0);
    });
  });

  describe('enabled toggle', () => {
    it('enabled=false suppresses dragenter visibility change', async () => {
      el.enabled = false;
      await el.updateComplete;

      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      await el.updateComplete;
      expect(el.visible).toBe(false);
    });

    it('enabled=false suppresses drop dispatch', () => {
      el.enabled = false;
      const fakeFile = new File(['x'], 'x.txt');
      let fired = 0;
      el.addEventListener('drop-file-selected', () => fired++);

      document.dispatchEvent(
        makeDragEvent('drop', { hasFiles: true, files: [fakeFile] }),
      );

      expect(fired).toBe(0);
    });
  });
});
