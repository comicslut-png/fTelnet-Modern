/*
  fTelnet: An HTML5 WebSocket client
  Copyright (C) Rick Parrish, R&M Software

  This file is part of fTelnet.

  fTelnet is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or any later version.

  fTelnet is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with fTelnet.  If not, see <http://www.gnu.org/licenses/>.
*/

import { LitElement, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

/**
 * Payload for the `manual-close` event — fires when the user
 * dismisses the manual via the close button. The host listens
 * for this to update its own tracking state.
 */
export interface ManualCloseDetail {
  /* Empty — the event itself is the signal. */
}

/**
 * <f-user-manual> — a floating popup that displays the user
 * manual content. Phase 5 (beta.3).
 *
 * Design properties:
 *   - **Independent of the menu**: opened by clicking "Manual" on
 *     the main menu. Menu closes when this opens; manual stays
 *     open until the user closes it or the session disconnects.
 *   - **Draggable**: user can grab the title bar and move the
 *     popup around the viewport.
 *   - **Resizable**: standard CSS `resize: both` corner grip; min
 *     400x300 to keep content readable.
 *   - **Scrollable body**: content overflows vertically; the user
 *     can scroll through the whole manual or jump to TOC anchors.
 *   - **Self-contained anchors**: TOC links scroll within the
 *     popup's own body (not the host page) via custom click
 *     handlers, so the manual works the same whether or not
 *     fTelnet is itself inside an iframe.
 *
 * Light DOM is used so the existing ftelnet.css styles apply
 * uniformly — matching the pattern of FSettingsPanel and the
 * other components.
 *
 * Events (all bubble + composed):
 *   - `manual-close` — close button or Escape key was used
 */
@customElement('f-user-manual')
export class FUserManual extends LitElement {
  /**
   * Whether the manual popup is visible. When false, the
   * component renders nothing — light-DOM presence with empty
   * children, costing virtually nothing.
   */
  @property({ type: Boolean })
  open = false;

  /**
   * Initial X position in viewport pixels. The host typically
   * leaves this at 0 and lets the component center itself on
   * first open (see firstOpenCentering()). After that, the user
   * can drag the popup anywhere.
   */
  @property({ type: Number, attribute: 'page-x' })
  pageX = 0;

  /**
   * Initial Y position in viewport pixels.
   */
  @property({ type: Number, attribute: 'page-y' })
  pageY = 0;

  /**
   * Width in pixels. Default 600. Resizable from there by the
   * user. Sticks across re-renders.
   */
  @state()
  private _width = 600;

  /**
   * Height in pixels. Default 500.
   */
  @state()
  private _height = 500;

  /**
   * Whether the user has interacted with positioning yet. On the
   * first `open=true`, we center the popup; after that, the user
   * may have dragged it somewhere and we leave it where they put
   * it. This flag tracks "should we apply default-centering on
   * the next open?"
   */
  @state()
  private _hasPositioned = false;

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override updated(
    changedProperties: Map<string, unknown>,
  ): void {
    // First open: center on viewport. Subsequent opens preserve
    // wherever the user left it.
    if (
      changedProperties.has('open') &&
      this.open &&
      !this._hasPositioned
    ) {
      this.centerInViewport();
      this._hasPositioned = true;
    }
  }

  /**
   * Center the popup in the viewport based on current width and
   * height. Called the first time the manual opens. After that,
   * the user's drag positions take over.
   */
  private centerInViewport(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.pageX = Math.max(0, Math.floor((vw - this._width) / 2));
    this.pageY = Math.max(0, Math.floor((vh - this._height) / 2));
  }

  /**
   * Reset positioning state — called by the host on disconnect
   * to ensure the next open re-centers fresh. (Otherwise a user
   * who dragged the manual far off-screen and disconnected would
   * have it open in the same off-screen spot next session.)
   */
  public resetPosition(): void {
    this._hasPositioned = false;
  }

  /**
   * Build the inline style string for the popup container. CSS
   * variables (theme colors, font, etc.) come from the host
   * stylesheet; the inline style only handles geometry which
   * varies per-instance.
   */
  private buildInlineStyle(): string {
    return [
      `left:${this.pageX}px`,
      `top:${this.pageY}px`,
      `width:${this._width}px`,
      `height:${this._height}px`,
      this.open ? '' : 'display:none',
    ]
      .filter(Boolean)
      .join(';');
  }

  /** Close-button click handler. Dispatches `manual-close`. */
  private handleCloseClick = (e: Event): void => {
    e.preventDefault();
    this.dispatchEvent(
      new CustomEvent<ManualCloseDetail>('manual-close', {
        detail: {},
        bubbles: true,
        composed: true,
      }),
    );
  };

  /**
   * Title-bar mousedown handler — begins a drag. We track the
   * cursor with document-level mousemove/mouseup listeners so
   * the drag continues even when the cursor leaves the title bar.
   */
  private handleTitleMouseDown = (e: MouseEvent): void => {
    // Only drag with primary button; ignore right-clicks etc.
    if (e.button !== 0) return;
    // Don't start a drag from the close button.
    if (
      (e.target as HTMLElement).classList.contains(
        'fTelnetUserManualClose',
      )
    ) {
      return;
    }
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const initialPageX = this.pageX;
    const initialPageY = this.pageY;

    const onMove = (ev: MouseEvent): void => {
      this.pageX = initialPageX + (ev.clientX - startX);
      this.pageY = initialPageY + (ev.clientY - startY);
    };
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /**
   * TOC anchor click handler — scrolls the matching section into
   * view within the body. We do this manually rather than
   * relying on `href="#anchor"` because that would navigate the
   * host page (or the iframe holding fTelnet) instead of scrolling
   * within the popup.
   */
  private handleTocClick = (e: MouseEvent, anchor: string): void => {
    e.preventDefault();
    const body = this.querySelector('.fTelnetUserManualBody');
    if (!body) return;
    const target = body.querySelector(`[data-anchor="${anchor}"]`);
    if (!target) return;
    // Guard against environments without scrollIntoView (e.g. jsdom
    // in tests). The user-facing behavior is "scroll the target
    // into view"; if the host environment can't do that, we just
    // succeed silently — the user can scroll manually.
    const el = target as HTMLElement;
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  };

  protected override render(): TemplateResult {
    const inlineStyle = this.buildInlineStyle();

    return html`
      <div class="fTelnetUserManual" style=${inlineStyle}>
        <div
          class="fTelnetUserManualHeader"
          @mousedown=${this.handleTitleMouseDown}
        >
          <span class="fTelnetUserManualTitle">fTelnet User Manual</span>
          <a
            href="#"
            class="fTelnetUserManualClose"
            @click=${this.handleCloseClick}
            >✕</a
          >
        </div>
        <div class="fTelnetUserManualBody">${this.renderContent()}</div>
      </div>
    `;
  }

  /**
   * The manual content itself. Rendered as a single scrollable
   * body. TOC anchors at the top jump down to each section.
   *
   * Kept in the component file rather than as a separate markdown
   * asset to avoid a build-time conversion step. The content is
   * stable enough that hardcoding is appropriate.
   */
  private renderContent(): TemplateResult {
    return html`
      <h1 data-anchor="welcome">fTelnet User Manual</h1>

      <p>
        Welcome to fTelnet, a modern way to connect to a BBS right
        from your web browser.
      </p>

      <p>
        If you're new here: a <strong>BBS</strong> (Bulletin Board
        System) is a community you dial into — a place to read
        messages, play door games, swap files, and chat with other
        folks. They were the social internet before the Web
        existed, and they're still alive and kicking today.
        There's a small but passionate community of sysops (the
        people who run BBSes) keeping the lights on, and you've
        just found a way in.
      </p>

      <p>
        fTelnet handles the connection plumbing so you don't have
        to. Click around, explore — you can't really break
        anything from this side of the connection.
      </p>

      <h2>Contents</h2>
      <ul class="fTelnetUserManualToc">
        <li>
          <a
            href="#connect-disconnect"
            @click=${(e: MouseEvent): void =>
              this.handleTocClick(e, 'connect-disconnect')}
            >Connect / Disconnect</a
          >
        </li>
        <li>
          <a
            href="#copy-paste"
            @click=${(e: MouseEvent): void =>
              this.handleTocClick(e, 'copy-paste')}
            >Copy / Paste</a
          >
        </li>
        <li>
          <a
            href="#upload-download"
            @click=${(e: MouseEvent): void =>
              this.handleTocClick(e, 'upload-download')}
            >Upload / Download</a
          >
        </li>
        <li>
          <a
            href="#about-transfers"
            @click=${(e: MouseEvent): void =>
              this.handleTocClick(e, 'about-transfers')}
            >About File Transfers</a
          >
        </li>
        <li>
          <a
            href="#keyboard"
            @click=${(e: MouseEvent): void =>
              this.handleTocClick(e, 'keyboard')}
            >Keyboard</a
          >
        </li>
        <li>
          <a
            href="#screen-size"
            @click=${(e: MouseEvent): void =>
              this.handleTocClick(e, 'screen-size')}
            >Screen Size</a
          >
        </li>
        <li>
          <a
            href="#scrollback"
            @click=${(e: MouseEvent): void =>
              this.handleTocClick(e, 'scrollback')}
            >Scrollback</a
          >
        </li>
        <li>
          <a
            href="#settings"
            @click=${(e: MouseEvent): void =>
              this.handleTocClick(e, 'settings')}
            >Settings</a
          >
        </li>
        <li>
          <a
            href="#language"
            @click=${(e: MouseEvent): void =>
              this.handleTocClick(e, 'language')}
            >Language</a
          >
        </li>
        <li>
          <a
            href="#tips"
            @click=${(e: MouseEvent): void => this.handleTocClick(e, 'tips')}
            >Tips &amp; Troubleshooting</a
          >
        </li>
      </ul>

      <h2 data-anchor="connect-disconnect">Connect / Disconnect</h2>
      <p>
        These two buttons are how you start and end your session
        with the BBS.
      </p>
      <p>
        <strong>Connect</strong> dials in. The sysop running this
        fTelnet page has already filled in the right address, so
        you don't have to type anything — just click and wait a
        moment while the connection opens. When you see a login
        screen, you're in. If nothing happens after several
        seconds, the BBS might be down or unreachable; try again
        in a few minutes.
      </p>
      <p>
        <strong>Disconnect</strong> hangs up. Most BBSes prefer
        that you log off properly from inside the BBS first
        (often by typing <code>G</code> for "Goodbye" or
        <code>Q</code> for "Quit") — it lets the BBS know you're
        leaving gracefully and frees up your account for next
        time. But if something hangs or you just need to leave,
        this button drops the connection immediately.
      </p>

      <h2 data-anchor="copy-paste">Copy / Paste</h2>
      <p>
        These work like copy and paste in any other program, with
        one BBS-specific quirk to watch out for.
      </p>
      <p>
        <strong>Copy</strong> grabs text from the screen. Click
        and drag your mouse over the text you want to highlight,
        then click Copy to put it on your clipboard. From there,
        you can paste it into a note, a chat, an email, or
        anywhere else.
      </p>
      <p>
        <strong>Paste</strong> sends text from your clipboard
        into the BBS, as if you typed it. Useful for long
        passwords, URLs the BBS asks you for, or anything you've
        copied from another window. A friendly warning: BBSes
        process pasted text very quickly. If you paste several
        lines into a menu, the BBS will read them as your menu
        choices and zip through them. When in doubt, paste one
        line at a time.
      </p>

      <h2 data-anchor="upload-download">Upload / Download</h2>
      <p>
        These two buttons move files between your computer and
        the BBS. How they work depends on which protocol you've
        picked (more on that in the next section).
      </p>
      <p>
        <strong>Upload</strong> sends a file (or several files)
        from your computer to the BBS. First, navigate to the
        BBS's upload area on its side (usually a menu choice like
        "U" for Upload). Then click Upload here, pick the files
        from your computer, confirm in the popup, and the
        transfer begins. A progress panel shows how it's going.
        You can also drag and drop files directly onto the
        fTelnet window to start an upload — easier than
        browsing.
      </p>
      <p>
        <strong>Download</strong> receives a file from the BBS to
        your computer. For most BBSes using the default protocol,
        you just navigate to a file area on the BBS, pick a file
        to download, and the transfer starts automatically — your
        browser will offer to save the file when it finishes. If
        you've switched to the older protocol, you'll need to
        click Download here to start the transfer manually.
      </p>

      <h2 data-anchor="about-transfers">About File Transfers</h2>
      <p>
        Once upon a time, getting files to and from a BBS over a
        phone line was an adventure. Several different "protocols"
        — agreements between the two computers about how to send
        the bytes — were invented over the years. fTelnet supports
        the two that matter today.
      </p>
      <p>
        <strong>ZMODEM (recommended)</strong> is the modern
        standard. Almost every BBS speaks it. When you ask the
        BBS to send you a file, ZMODEM kicks in automatically —
        you don't need to click anything in fTelnet to start the
        download. Just pick the file on the BBS side and ZMODEM
        handles the rest. For uploading, drag and drop your files
        onto the fTelnet window (or click Upload to pick them),
        confirm, and ZMODEM sends them. ZMODEM also supports
        sending multiple files at once.
      </p>
      <p>
        <strong>YMODEM</strong> is older and slower, kept around
        for the rare BBS that doesn't speak ZMODEM. To use it,
        switch your protocol setting to YMODEM, then use the
        Upload or Download buttons in the menu. Unlike ZMODEM,
        YMODEM downloads need you to click the Download button to
        start.
      </p>
      <p>
        If you're not sure which one to use, the answer is
        ZMODEM. Almost every BBS running today supports it.
      </p>
      <p>
        <strong>A note about upload areas:</strong> many BBSes
        have two different upload options — one for sending a
        single file at a time, and a separate "batch" upload area
        for sending several files in one go. If you want to send
        multiple files, look for the batch upload menu on the
        BBS; the single-file upload usually processes each file
        right when it arrives, which means trying to send more
        than one in a row won't work.
      </p>

      <h2 data-anchor="keyboard">Keyboard</h2>
      <p>
        On a touch device (phone or tablet) where you don't have
        a physical keyboard, this button shows or hides an
        on-screen keyboard. The keyboard has special keys for
        things BBSes care about — function keys, arrow keys,
        escape — that mobile keyboards usually don't include.
      </p>
      <p>
        On a computer with a real keyboard, this button isn't
        shown. You don't need it.
      </p>

      <h2 data-anchor="screen-size">Screen Size</h2>
      <p>
        Changes how many rows and columns of text are shown.
        BBSes traditionally use 80×25 (80 characters wide, 25
        rows tall) because that's what old hardware displayed.
        Some BBSes support bigger sizes like 132×37 or 80×50 —
        if you pick one and the BBS supports it, you'll see more
        content at once. If the BBS doesn't support it, the
        screen might look weirdly aligned. When in doubt, leave
        it at 80×25.
      </p>

      <h2 data-anchor="scrollback">Scrollback</h2>
      <p>
        Lets you scroll up to see text that's already gone off
        the top of the screen. Useful for re-reading a message
        you didn't catch, copying out something a few seconds
        ago, or finding an option you missed. Click again or
        press Esc to return to the live screen.
      </p>

      <h2 data-anchor="settings">Settings</h2>
      <p>
        Opens a panel where you can customize how fTelnet looks
        and behaves. The settings are organized into a few
        groups:
      </p>
      <p>
        <strong>Theme</strong> — Six different visual styles,
        from the classic blue-and-white panels to retro green CRT
        phosphor, neon Cyberpunk, Gothic, and more. Pick whatever
        suits your mood.
      </p>
      <p>
        <strong>Protocol</strong> — Choose between ZMODEM (the
        modern standard) and YMODEM (the older one). This affects
        how the Upload and Download buttons work. See
        <strong>About File Transfers</strong> above.
        <strong>Auto Detect</strong> is a separate toggle —
        leave it on unless you have a specific reason to turn it
        off.
      </p>
      <p>
        <strong>Language</strong> — Switch the menus, buttons, and
        status messages between English, German, French, and
        Spanish. See <strong>Language</strong> below for details.
      </p>
      <p>
        <strong>Sound</strong> — Mute or unmute the bell sound
        BBSes occasionally play.
      </p>
      <p>
        <strong>Touch</strong> — On phones and tablets, adjusts
        how long the device vibrates when you tap a key on the
        on-screen keyboard.
      </p>
      <p>
        <strong>About</strong> — Shows the version of fTelnet
        you're using, who made it, and where to find the source
        code.
      </p>
      <p>
        Your choices stick around while you're using fTelnet —
        they survive reloading the page or reconnecting. They
        reset to the defaults when you close the tab, so the next
        person to open fTelnet on a shared computer starts fresh.
      </p>

      <h2 data-anchor="language">Language</h2>
      <p>
        fTelnet can display its menus, buttons, and connection
        messages in several languages. Open
        <strong>Settings</strong> and find the
        <strong>Language</strong> box, then pick the one you want.
        The change happens instantly — no need to reconnect.
      </p>
      <p>
        Available languages right now are
        <strong>English</strong>, <strong>Deutsch</strong>
        (German), <strong>Français</strong> (French),
        <strong>Español</strong> (Spanish),
        <strong>Português</strong> (Portuguese),
        <strong>Nederlands</strong> (Dutch),
        <strong>Italiano</strong> (Italian),
        <strong>Русский</strong> (Russian),
        <strong>Svenska</strong> (Swedish),
        <strong>Polski</strong> (Polish),
        <strong>Українська</strong> (Ukrainian),
        <strong>Suomi</strong> (Finnish),
        <strong>Ελληνικά</strong> (Greek),
        <strong>Čeština</strong> (Czech), and
        <strong>日本語</strong> (Japanese). More languages may be
        added in future releases.
      </p>
      <p>
        Note: the language setting changes the client's own menus,
        settings, and status messages. It does not translate the
        content of the BBS you connect to — that text comes from the
        BBS itself, in whatever language and encoding it sends.
      </p>
      <p>
        A few things worth knowing:
      </p>
      <ul>
        <li>
          Only the fTelnet interface changes language — the menus,
          the buttons, and the status line at the bottom. What the
          BBS itself sends you stays in whatever language the BBS
          uses; fTelnet can't translate the BBS.
        </li>
        <li>
          The on-screen keyboard stays in English regardless of
          the language you pick.
        </li>
        <li>
          Like the other settings, your language choice lasts for
          your current session and resets when you close the tab.
        </li>
        <li>
          If a particular word hasn't been translated yet, fTelnet
          shows the English version for that one item rather than
          leaving it blank — so nothing ever goes missing.
        </li>
      </ul>
      <p>
        Are you a sysop or user who speaks a language not listed
        here, and would like to help translate fTelnet? Reach out
        through the project page in the <strong>About</strong>
        section — contributions are welcome.
      </p>

      <h2 data-anchor="tips">Tips &amp; Troubleshooting</h2>
      <p>
        <strong
          >The screen shows weird characters or boxes instead of
          letters.</strong
        >
        The BBS is sending data in a format fTelnet isn't
        expecting. Try disconnecting and reconnecting — sometimes
        the connection desyncs. If it persists, the BBS may be
        configured for something fTelnet doesn't support yet.
      </p>
      <p>
        <strong>I clicked Connect and nothing happened.</strong>
        The BBS may be down, busy, or your internet connection is
        having a moment. Wait a minute and try again.
      </p>
      <p>
        <strong>A file transfer is taking forever.</strong> BBSes
        vary widely in speed. Larger files on older BBSes can
        take minutes — that's normal. You can cancel a transfer
        by pressing <strong>Esc</strong> or
        <strong>Ctrl+X</strong>.
      </p>
      <p>
        <strong
          >Different kinds of BBSes — ANSI, Commodore, Atari,
          Amiga.</strong
        >
        Not every BBS uses the same display style. Most BBSes
        today serve <strong>ANSI</strong>, the standard PC-style
        display you'll usually see — colored text on a black
        background, box-drawing characters, that classic BBS
        look. fTelnet handles ANSI out of the box; nothing for
        you to configure.
      </p>
      <p>
        But some BBSes — especially ones running on or styled
        after vintage Commodore 64, Atari 8-bit, or Amiga
        computers — use different character sets and color
        palettes. fTelnet can render those too:
      </p>
      <ul>
        <li>
          <strong>PETSCII</strong> — the Commodore style, often
          used by C64 and C128 BBSes (light blue text on dark
          blue, blocky graphics)
        </li>
        <li>
          <strong>ATASCII</strong> — the Atari 8-bit style (pale
          blue text on dark blue)
        </li>
        <li>
          <strong>Topaz / Amiga ANSI</strong> — the Amiga style
          (classic Topaz font, often colorful)
        </li>
      </ul>
      <p>
        These have to be turned on by the sysop in their fTelnet
        setup — they're not something you can toggle from this
        side. So if the BBS you're visiting is a Commodore,
        Atari, or Amiga-themed BBS and it doesn't look quite
        right, mention it to the sysop. There's a good chance
        they just need to flip a switch on their end.
      </p>
      <p>
        <strong>My session got disconnected.</strong> Like
        landlines of old, BBS connections can drop. Just click
        Connect again. Most BBSes will let you pick up where you
        left off.
      </p>

      <h2>Closing</h2>
      <p>
        That's it. You've got everything you need to be a BBS
        user in 2026. The menus on each BBS are different — every
        sysop runs their place a little differently — but the
        basic moves are the same everywhere: connect, log in,
        look around, post a message, play a game, log out. Have
        fun.
      </p>
      <p>
        If something looks weird and you can't figure it out, the
        sysop running this BBS is usually a click away and is
        genuinely happy to help. That's part of what makes a BBS
        what it is.
      </p>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'f-user-manual': FUserManual;
  }
}
