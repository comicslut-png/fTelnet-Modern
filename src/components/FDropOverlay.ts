/*
 * fTelnet-Modern — drag-and-drop overlay component
 *
 * Copyright (C) 2026 Tom Swartz <dangerbaybbs@hotmail.com>
 * Copyright (C) 2009-2026 R&M Software (Rick Parrish, original fTelnet)
 *
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { html, LitElement, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/** Payload for `drop-file-selected` event. */
export interface DropFileSelectedDetail {
  file: File;
}

/**
 * `<f-drop-overlay>` — translucent overlay shown when the user is
 * dragging a file over the page. Phase 5 polish; part of the
 * upload UI sub-project (Delta 1).
 *
 * Behavior:
 *   - Listens for `dragenter`/`dragover`/`dragleave`/`drop` on the
 *     document, NOT on its own element. The user could be dragging
 *     anywhere on the page; we want the overlay to appear regardless.
 *   - On `dragenter` with files in the drag: become visible
 *   - On `dragleave` outside the page area: hide
 *   - On `drop`: hide, and dispatch `drop-file-selected` with the
 *     first file (single-file only this delta; multi-file is Q7-(c)
 *     deferred).
 *   - Only single-file drops are honored in this delta. Multiple
 *     files dropped trigger an error event (deferred for now —
 *     just take the first file silently).
 *
 * Design notes:
 *   - The overlay is light DOM so existing fTelnet CSS conventions
 *     apply.
 *   - Position: fixed, full-viewport, z-index above the menu/
 *     settings popups (z-index 2000) so it's visible during any
 *     state of the app.
 *   - Translucent dark background (rgba 0.75) with a centered
 *     "Drop file here to upload via ZMODEM" message.
 *   - When the user drags a file from outside the browser, the
 *     `dragenter` fires with files; when they drag-select inside
 *     the page (text selection), it doesn't. We check
 *     `e.dataTransfer.types.includes('Files')` to filter.
 */
@customElement('f-drop-overlay')
export class FDropOverlay extends LitElement {
  /**
   * Whether the overlay is currently shown. Driven by drag events
   * but also overridable from the parent — for tests, or to
   * disable drop entirely.
   */
  @property({ type: Boolean })
  visible = false;

  /**
   * Whether dropping is currently enabled. When false, drag events
   * don't show the overlay and drops are ignored. Parent toggles
   * this off during an active transfer to avoid concurrent uploads.
   */
  @property({ type: Boolean })
  enabled = true;

  /**
   * Counter for dragenter/dragleave pair tracking. dragenter fires
   * for every child element you drag over, dragleave fires when
   * you leave each one. Tracking depth avoids "overlay flickers
   * off when crossing element boundaries" bugs.
   */
  private _dragCounter = 0;

  /**
   * Watchdog timer: while a drag is in progress, `dragover` fires
   * continuously (~every few ms). If `dragover` stops firing for
   * `DRAG_WATCHDOG_MS`, the drag has effectively ended without
   * any explicit end event — this happens when the user drags the
   * file out of the browser window entirely on some platforms,
   * or alt-tabs mid-drag.
   *
   * Without this, the overlay would stick around until the user
   * starts another drag or reloads the page. The watchdog is the
   * "belt" — `dragleave on window`, `dragend`, and `blur` are
   * the "suspenders" — together they cover all the cases.
   */
  private _watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly DRAG_WATCHDOG_MS = 500;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /**
   * Light-DOM Lit elements can attach document-level listeners
   * via connectedCallback. We have to use document-level listeners
   * (not element-level) because the user can drag anywhere on the
   * page; we want to detect it everywhere.
   *
   * Multi-layer cancel detection is necessary because there's no
   * single browser event that reliably fires when a drag ends
   * without a drop:
   *
   *   - `dragleave` on document: fires when leaving any element,
   *     but the `_hasFiles` check can fail (some browsers blank
   *     `dataTransfer.types` during dragleave for security).
   *   - `dragleave` on window with `relatedTarget === null`:
   *     signals the cursor left the entire window.
   *   - `dragend`: fires on the source. For OS-originated file
   *     drags this doesn't fire reliably — but cheap to handle.
   *   - `mouseout` on documentElement with `relatedTarget === null`:
   *     backstop for cursor truly leaving viewport.
   *   - `blur` on window: catches alt-tab mid-drag.
   *   - `_watchdogTimer`: belt-and-suspenders timeout that fires
   *     if no `dragover` event arrives for 500ms.
   *
   * Any one of these is enough to hide the overlay.
   */
  public override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('dragenter', this._handleDragEnter);
    document.addEventListener('dragover', this._handleDragOver);
    document.addEventListener('dragleave', this._handleDragLeave);
    document.addEventListener('drop', this._handleDrop);
    document.addEventListener('dragend', this._handleDragEnd);
    document.addEventListener('mouseout', this._handleMouseOut);
    window.addEventListener('dragleave', this._handleWindowDragLeave);
    window.addEventListener('blur', this._handleWindowBlur);
  }

  public override disconnectedCallback(): void {
    document.removeEventListener('dragenter', this._handleDragEnter);
    document.removeEventListener('dragover', this._handleDragOver);
    document.removeEventListener('dragleave', this._handleDragLeave);
    document.removeEventListener('drop', this._handleDrop);
    document.removeEventListener('dragend', this._handleDragEnd);
    document.removeEventListener('mouseout', this._handleMouseOut);
    window.removeEventListener('dragleave', this._handleWindowDragLeave);
    window.removeEventListener('blur', this._handleWindowBlur);
    this._clearWatchdog();
    super.disconnectedCallback();
  }

  /**
   * Reset to "no drag in progress" state. Called from every cancel
   * pathway. Idempotent — safe to call when already hidden.
   */
  private _resetDragState = (): void => {
    this._dragCounter = 0;
    this.visible = false;
    this._clearWatchdog();
  };

  /**
   * (Re)arm the watchdog. Called on every dragover; if the timer
   * expires without being re-armed, the drag is considered ended.
   */
  private _armWatchdog(): void {
    this._clearWatchdog();
    this._watchdogTimer = setTimeout(() => {
      this._watchdogTimer = null;
      this._resetDragState();
    }, FDropOverlay.DRAG_WATCHDOG_MS);
  }

  private _clearWatchdog(): void {
    if (this._watchdogTimer !== null) {
      clearTimeout(this._watchdogTimer);
      this._watchdogTimer = null;
    }
  }

  /**
   * dragenter: increment depth counter. If this is the FIRST level
   * AND the drag is carrying files, show the overlay.
   */
  private _handleDragEnter = (e: DragEvent): void => {
    if (!this.enabled) return;
    if (!this._hasFiles(e)) return;
    e.preventDefault();
    this._dragCounter++;
    if (this._dragCounter === 1) {
      this.visible = true;
    }
    this._armWatchdog();
  };

  /**
   * dragover: required for the drop event to fire later. Browsers
   * will reject the drop if no element along the path called
   * preventDefault() on dragover. Also re-arms the watchdog —
   * dragover fires continuously while a drag is active, so a
   * gap in dragover events means the drag has ended.
   */
  private _handleDragOver = (e: DragEvent): void => {
    if (!this.enabled) return;
    if (!this._hasFiles(e)) return;
    e.preventDefault();
    // The 'copy' effect makes the cursor show a "+" icon — this
    // is a file copy operation from the user's perspective.
    if (e.dataTransfer !== null) {
      e.dataTransfer.dropEffect = 'copy';
    }
    this._armWatchdog();
  };

  /**
   * dragleave: decrement counter. When it drops to 0 we're truly
   * outside the page; hide the overlay.
   *
   * Important: we DON'T filter by `_hasFiles(e)` here. Some
   * browsers (notably Firefox) blank out `dataTransfer.types`
   * during `dragleave` for security/privacy reasons, so checking
   * it would cause the leave to be ignored and the counter to
   * stay positive forever. We rely on the counter itself + the
   * other cancel pathways to stay correct.
   */
  private _handleDragLeave = (_e: DragEvent): void => {
    if (!this.enabled) return;
    if (this._dragCounter === 0) return; // not currently dragging
    this._dragCounter--;
    if (this._dragCounter <= 0) {
      this._resetDragState();
    }
  };

  /**
   * dragleave on window: when relatedTarget is null, the cursor
   * has left the window entirely. This is the most reliable
   * "drag exited the page" signal across browsers.
   */
  private _handleWindowDragLeave = (e: DragEvent): void => {
    if (!this.enabled) return;
    if (e.relatedTarget === null) {
      this._resetDragState();
    }
  };

  /**
   * dragend: fires on the source element when a drag operation
   * ends (drop OR cancel via ESC). For OS-originated drags
   * (file from desktop), this isn't always reliable, but when it
   * does fire it's a clean signal.
   */
  private _handleDragEnd = (_e: DragEvent): void => {
    if (!this.enabled) return;
    this._resetDragState();
  };

  /**
   * mouseout on documentElement with null relatedTarget: backstop
   * for the cursor leaving the viewport without dragleave firing.
   * Happens on some platforms when the user drags fast.
   */
  private _handleMouseOut = (e: MouseEvent): void => {
    if (!this.enabled) return;
    if (this._dragCounter === 0) return;
    if (e.relatedTarget === null && (e as MouseEvent).target === document.documentElement) {
      this._resetDragState();
    }
  };

  /**
   * blur on window: catches alt-tab or click-on-other-window
   * during a drag. The drag is effectively canceled from our
   * perspective — the user is no longer interacting with our page.
   */
  private _handleWindowBlur = (): void => {
    if (!this.enabled) return;
    if (this._dragCounter > 0) {
      this._resetDragState();
    }
  };

  /**
   * drop: take the first file, dispatch the event. Reset state.
   * Multi-file drops take the first file silently (Q7 of Phase 5
   * planning — multi-file deferred).
   */
  private _handleDrop = (e: DragEvent): void => {
    if (!this.enabled) return;
    if (!this._hasFiles(e)) return;
    e.preventDefault();
    this._resetDragState();

    const files = e.dataTransfer?.files;
    if (files === undefined || files.length === 0) return;
    const file = files[0]!;
    this.dispatchEvent(
      new CustomEvent<DropFileSelectedDetail>('drop-file-selected', {
        detail: { file },
        bubbles: true,
        composed: true,
      }),
    );
  };

  /**
   * Check whether a drag event carries files (as opposed to
   * in-page text-selection drags, image drags from other browser
   * tabs, etc.). The `'Files'` type is the standard signal.
   */
  private _hasFiles(e: DragEvent): boolean {
    const types = e.dataTransfer?.types;
    if (types === undefined) return false;
    // DataTransferItemList doesn't have .includes() in all browsers,
    // hence the manual loop.
    for (let i = 0; i < types.length; i++) {
      if (types[i] === 'Files') return true;
    }
    return false;
  }

  protected override render(): TemplateResult {
    if (!this.visible) {
      return html``;
    }
    return html`
      <div class="fTelnetDropOverlay">
        <div class="fTelnetDropOverlayMessage">
          <div class="fTelnetDropOverlayIcon">📁</div>
          <div class="fTelnetDropOverlayTitle">
            Drop file here
          </div>
          <div class="fTelnetDropOverlaySubtitle">
            to upload via ZMODEM
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'f-drop-overlay': FDropOverlay;
  }
}
