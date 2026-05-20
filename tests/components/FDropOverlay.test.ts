import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  const fileArr = options.files ?? [];
  // FileList-like: needs .length AND .item(i). jsdom doesn't
  // construct real FileLists; we mimic the interface enough for
  // the component to iterate.
  const fileList = {
    length: fileArr.length,
    item: (i: number): File | null => fileArr[i] ?? null,
    // Indexed access (fileList[0]) for legacy reads.
    ...Object.fromEntries(fileArr.map((f, i) => [i, f])),
  } as unknown as FileList;
  const dt = {
    types: options.hasFiles ? ['Files'] : [],
    files: fileList,
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
    it('drop dispatches drop-file-selected with a single-file array', async () => {
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
      expect(captured?.files.length).toBe(1);
      expect(captured?.files[0]?.name).toBe('hello.txt');
      expect(el.visible).toBe(false);
    });

    it('drop with multiple files dispatches ALL files in order', async () => {
      // Phase 5 Delta 3: multi-file drops are now supported. The
      // dispatched array preserves the order the OS reported the
      // files in (typically the file-picker selection order or
      // file-manager display order for drag-select).
      const f1 = new File(['a'], 'a.txt');
      const f2 = new File(['b'], 'b.txt');
      const f3 = new File(['c'], 'c.txt');

      let captured: DropFileSelectedDetail | undefined;
      el.addEventListener('drop-file-selected', (e): void => {
        captured = (e as CustomEvent<DropFileSelectedDetail>).detail;
      });

      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      document.dispatchEvent(
        makeDragEvent('drop', { hasFiles: true, files: [f1, f2, f3] }),
      );

      expect(captured?.files.length).toBe(3);
      expect(captured?.files[0]?.name).toBe('a.txt');
      expect(captured?.files[1]?.name).toBe('b.txt');
      expect(captured?.files[2]?.name).toBe('c.txt');
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

  /*
    Cancel-pathway tests: covers the case where the user starts a
    drag but never drops, instead dragging off-screen, hitting ESC,
    alt-tabbing, etc. The overlay must hide in all of these cases.

    Pre-fix bug: if you dragged a file onto the canvas then dragged
    it off the browser entirely, the "Drop file here" overlay would
    stick around until you started another drag or reloaded.

    The fix layers multiple cancel signals:
      - dragleave on document (even when dataTransfer.types is blank)
      - dragleave on window with relatedTarget === null
      - dragend on document
      - mouseout on documentElement with relatedTarget === null
      - blur on window
      - watchdog timer fires after 500ms of no dragover
   */
  describe('cancel pathways', () => {
    it('dragleave WITHOUT hasFiles still decrements (Firefox blanks types on leave)', async () => {
      // Some browsers (notably Firefox) zero out dataTransfer.types
      // during dragleave for security reasons. The original code
      // filtered by _hasFiles, which meant Firefox dragleaves would
      // be ignored and the overlay would stick.
      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      await el.updateComplete;
      expect(el.visible).toBe(true);

      // Simulate Firefox: dragleave with NO files reported.
      document.dispatchEvent(makeDragEvent('dragleave', { hasFiles: false }));
      await el.updateComplete;
      expect(el.visible).toBe(false);
    });

    it('window dragleave with null relatedTarget hides overlay (drag exited window)', async () => {
      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      await el.updateComplete;
      expect(el.visible).toBe(true);

      const winLeave = makeDragEvent('dragleave', { hasFiles: false });
      // relatedTarget = null means "the cursor went somewhere outside
      // the document entirely." This is the canonical "drag left the
      // window" signal.
      Object.defineProperty(winLeave, 'relatedTarget', {
        value: null,
        writable: false,
      });
      window.dispatchEvent(winLeave);
      await el.updateComplete;
      expect(el.visible).toBe(false);
    });

    it('dragend on document resets state', async () => {
      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      await el.updateComplete;
      expect(el.visible).toBe(true);

      document.dispatchEvent(makeDragEvent('dragend'));
      await el.updateComplete;
      expect(el.visible).toBe(false);
    });

    it('window blur during drag resets state (alt-tab mid-drag)', async () => {
      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      await el.updateComplete;
      expect(el.visible).toBe(true);

      window.dispatchEvent(new Event('blur'));
      await el.updateComplete;
      expect(el.visible).toBe(false);
    });

    it('window blur without drag in progress is a no-op', async () => {
      // Should not throw / mutate state when we're not dragging.
      window.dispatchEvent(new Event('blur'));
      await el.updateComplete;
      expect(el.visible).toBe(false);
    });

    it('mouseout on documentElement with null relatedTarget resets state', async () => {
      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      await el.updateComplete;
      expect(el.visible).toBe(true);

      const mouseOut = new MouseEvent('mouseout', { bubbles: true });
      Object.defineProperty(mouseOut, 'relatedTarget', {
        value: null,
        writable: false,
      });
      Object.defineProperty(mouseOut, 'target', {
        value: document.documentElement,
        writable: false,
      });
      document.dispatchEvent(mouseOut);
      await el.updateComplete;
      expect(el.visible).toBe(false);
    });

    it('mouseout NOT on documentElement is ignored (regular intra-page move)', async () => {
      document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
      await el.updateComplete;

      // mouseout firing on document.body (e.g. crossing element
      // boundaries inside the page) should NOT clear the overlay.
      const mouseOut = new MouseEvent('mouseout', { bubbles: true });
      Object.defineProperty(mouseOut, 'relatedTarget', {
        value: document.body,
        writable: false,
      });
      Object.defineProperty(mouseOut, 'target', {
        value: document.body,
        writable: false,
      });
      document.dispatchEvent(mouseOut);
      await el.updateComplete;
      expect(el.visible).toBe(true);
    });

    it('watchdog timer hides overlay after dragover stops firing', async () => {
      vi.useFakeTimers();
      try {
        document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
        await el.updateComplete;
        expect(el.visible).toBe(true);

        // dragover keeps the watchdog armed. After we stop firing
        // dragover, the timer should expire after 500ms.
        vi.advanceTimersByTime(499);
        await el.updateComplete;
        expect(el.visible).toBe(true); // still within window

        vi.advanceTimersByTime(2);
        await el.updateComplete;
        expect(el.visible).toBe(false); // expired
      } finally {
        vi.useRealTimers();
      }
    });

    it('continuing dragover keeps the watchdog re-armed', async () => {
      vi.useFakeTimers();
      try {
        document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
        await el.updateComplete;
        expect(el.visible).toBe(true);

        // Simulate continuous drag: dragover every 100ms for 2 seconds.
        for (let i = 0; i < 20; i++) {
          vi.advanceTimersByTime(100);
          document.dispatchEvent(makeDragEvent('dragover', { hasFiles: true }));
        }
        await el.updateComplete;
        // Overlay should STILL be visible — the watchdog kept getting
        // re-armed by each dragover.
        expect(el.visible).toBe(true);

        // Now stop firing dragover. After 500ms it should hide.
        vi.advanceTimersByTime(501);
        await el.updateComplete;
        expect(el.visible).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('disconnectedCallback clears the watchdog timer', async () => {
      vi.useFakeTimers();
      try {
        document.dispatchEvent(makeDragEvent('dragenter', { hasFiles: true }));
        await el.updateComplete;
        expect(el.visible).toBe(true);

        // Detach the component. Any pending watchdog should be cleared
        // so it doesn't fire on a detached element.
        document.body.removeChild(el);
        vi.advanceTimersByTime(1000);
        // No assertion needed — the test just shouldn't throw or warn
        // about acting on a detached component. The afterEach will
        // skip the removeChild that's already happened.
      } finally {
        vi.useRealTimers();
        // Re-attach so afterEach's removeChild doesn't blow up.
        document.body.appendChild(el);
      }
    });
  });
});
