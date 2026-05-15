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

import { saveAs } from 'file-saver';

import { ByteArray, CRC, StringUtils, TypedEvent, type IEvent } from '../common/index.js';
import { WebSocketConnection } from '../connections/index.js';
import { Crt, KeyPressEvent } from '../crt/index.js';
import {
  BorderStyle,
  ContentAlignment,
  CrtLabel,
  CrtPanel,
  CrtProgressBar,
  ProgressBarStyle,
} from '../crtcontrols/index.js';
import { FileRecord } from './FileRecord.js';

/**
 * YMODEM-G batch file receive over a WebSocket connection.
 *
 * Drives a small modal CRT dialog showing per-file and total progress,
 * polls the connection on a setInterval-driven timer, and writes each
 * completed file to the user's machine via `file-saver` (the browser's
 * standard download flow).
 *
 * Phase 1 migration notes:
 *   - This whole module is scheduled for removal in Phase 4: YMODEM
 *     will be dropped, ZMODEM will replace it via `zmodemjs`. The
 *     migration policy is "preserve what works" rather than refactor.
 *
 *   - `FileSaver.js` is imported as a module rather than read off
 *     the global `saveAs`. Behavior is identical; the global-pollution
 *     hack the original used is replaced by a proper import.
 *
 *   - Several fields are assigned in `Download()` rather than in
 *     the constructor. Strict mode would normally flag these, so
 *     they get the definite-assignment assertion (`!`). The contract
 *     is: never call any method other than `Download()` first.
 *
 *   - `var` → `let`/`const` throughout. The error-handling pattern
 *     was `catch (ioe1) { ... } catch (ioe2) { ... }` with numbered
 *     suffixes to keep TypeScript's old per-block scoping happy.
 *     With block-scoped `let`/`const` we can drop the suffixes —
 *     each catch block creates its own `ioe` binding. Comments in
 *     each catch site preserve which numbered handler is which from
 *     the original.
 *
 *   - The `KPE.keyString.charCodeAt(0) === this.CAN` Ctrl+X check
 *     is preserved exactly. Note: CAN is 0x18 (Ctrl+X). The Crt
 *     synthesizes a one-char keyString for control keys.
 */
export class YModemReceive {
  // ───── Public events ─────
  /** Fires once the dialog has dismissed and the receive is fully done. */
  public ontransfercomplete: IEvent = new TypedEvent();

  // ───── YMODEM protocol bytes ─────
  private readonly SOH = 0x01;
  private readonly STX = 0x02;
  private readonly EOT = 0x04;
  private readonly ACK = 0x06;
  // NAK (0x15) is unused in YMODEM-G; preserved as a comment for orientation.
  private readonly CAN = 0x18;
  // SUB (0x1A) is the YMODEM padding byte, not used on receive.
  private readonly CAPG: number = 'G'.charCodeAt(0);

  // ───── Connection & state ─────
  private readonly _Connection: WebSocketConnection;
  private readonly _Crt: Crt;
  private _ExpectingHeader = true;
  private _File!: FileRecord; // assigned when the first header arrives
  private readonly _Files: FileRecord[] = [];
  private _LastGTime = 0;
  private _NextByte = 0;
  private _ShouldSendG = true;
  private _Timer: ReturnType<typeof setInterval> | undefined;
  private _TotalBytesReceived = 0;

  // ───── Dialog elements (built in Download()) ─────
  private lblFileCount!: CrtLabel;
  private lblFileName!: CrtLabel;
  private lblFileSize!: CrtLabel;
  private lblFileReceived!: CrtLabel;
  private lblTotalReceived!: CrtLabel;
  private lblStatus!: CrtLabel;
  private pbFileReceived!: CrtProgressBar;
  private pnlMain!: CrtPanel;

  constructor(crt: Crt, connection: WebSocketConnection) {
    this._Crt = crt;
    this._Connection = connection;
  }

  /**
   * Aborts the transfer by sending 5 CANs (the YMODEM cancel
   * sequence) plus a small backspace-and-overwrite sequence that
   * cleans up any echo of the CANs in case the sender's terminal
   * is also showing them. Then drains the input buffer, logs the
   * reason, and tears down via CleanUp.
   */
  private Cancel(reason: string): void {
    try {
      this._Connection.writeByte(this.CAN);
      this._Connection.writeByte(this.CAN);
      this._Connection.writeByte(this.CAN);
      this._Connection.writeByte(this.CAN);
      this._Connection.writeByte(this.CAN);
      this._Connection.writeString('\b\b\b\b\b     \b\b\b\b\b'); // will auto-flush
    } catch (ioe) {
      // ioe1 in original
      this.HandleIOError(ioe);
      return;
    }

    // Drain the input buffer so any pending bytes don't contaminate
    // the subsequent connection state.
    try {
      this._Connection.readString();
    } catch (ioe) {
      // ioe2 in original
      this.HandleIOError(ioe);
      return;
    }

    this.CleanUp('Cancelling (' + reason + ')');
  }

  /**
   * Common teardown path: stop the poll timer, update the status
   * label, and schedule the dialog dismissal 3 seconds later so
   * the user can read the final status message.
   */
  private CleanUp(message: string): void {
    clearInterval(this._Timer);

    this.lblStatus.Text = 'Status: ' + message;

    setTimeout((): void => {
      this.Dispatch();
    }, 3000);
  }

  /**
   * Hide the dialog, restore the cursor, and emit `ontransfercomplete`.
   */
  private Dispatch(): void {
    this.pnlMain.Hide();
    this._Crt.ShowCursor();

    this.ontransfercomplete.trigger();
  }

  /**
   * Entry point: build the dialog, start the poll timer.
   *
   * The 0ms setInterval is intentional — it yields to the event
   * loop between iterations so other handlers (keyboard, websocket
   * onmessage) can fire, while still polling as fast as the browser
   * allows.
   */
  public Download(): void {
    this._Timer = setInterval((): void => {
      this.OnTimer();
    }, 0);

    this._Crt.HideCursor();
    this.pnlMain = new CrtPanel(
      this._Crt,
      undefined,
      10,
      5,
      60,
      14,
      BorderStyle.Single,
      Crt.WHITE,
      Crt.BLUE,
      'YModem-G Receive Status (Hit CTRL+X to abort)',
      ContentAlignment.TopLeft
    );
    this.lblFileCount = new CrtLabel(
      this._Crt,
      this.pnlMain,
      2,
      2,
      56,
      'Receiving file 1',
      ContentAlignment.Left,
      Crt.YELLOW,
      Crt.BLUE
    );
    this.lblFileName = new CrtLabel(
      this._Crt,
      this.pnlMain,
      2,
      4,
      56,
      'File Name: ',
      ContentAlignment.Left,
      Crt.YELLOW,
      Crt.BLUE
    );
    this.lblFileSize = new CrtLabel(
      this._Crt,
      this.pnlMain,
      2,
      5,
      56,
      'File Size: ',
      ContentAlignment.Left,
      Crt.YELLOW,
      Crt.BLUE
    );
    this.lblFileReceived = new CrtLabel(
      this._Crt,
      this.pnlMain,
      2,
      6,
      56,
      'File Recv: ',
      ContentAlignment.Left,
      Crt.YELLOW,
      Crt.BLUE
    );
    this.pbFileReceived = new CrtProgressBar(
      this._Crt,
      this.pnlMain,
      2,
      7,
      56,
      ProgressBarStyle.Continuous
    );
    this.lblTotalReceived = new CrtLabel(
      this._Crt,
      this.pnlMain,
      2,
      9,
      56,
      'Total Recv: ',
      ContentAlignment.Left,
      Crt.YELLOW,
      Crt.BLUE
    );
    this.lblStatus = new CrtLabel(
      this._Crt,
      this.pnlMain,
      2,
      11,
      56,
      'Status: Transferring file(s)',
      ContentAlignment.Left,
      Crt.WHITE,
      Crt.BLUE
    );
  }

  /** Returns the i-th completed file. Used by external code that wants to do something with the received files. */
  public FileAt(index: number): FileRecord {
    return this._Files[index]!;
  }

  /** Number of completed files. */
  public get FileCount(): number {
    return this._Files.length;
  }

  /**
   * Log an I/O error and tear down with a context-appropriate
   * message (different text for "still connected" vs "lost the
   * connection").
   *
   * Type is `unknown` rather than `Error` because TS 5 strict mode
   * makes catch-clause bindings `unknown` by default. We cast to
   * string for the log message.
   */
  private HandleIOError(ioe: unknown): void {
    // eslint-disable-next-line no-console
    console.log('I/O Error: ' + String(ioe));

    if (this._Connection.connected) {
      this.CleanUp('Unhandled I/O error');
    } else {
      this.CleanUp('Connection to server lost');
    }
  }

  /**
   * Poll once: drain any buffered keypresses (looking for Ctrl+X),
   * then process as many bytes from the connection as we can.
   *
   * The YMODEM-G "G" keepalive is sent after 3 seconds of quiet
   * to nudge the sender. We stop sending G's once a file transfer
   * has actively started (see `_ShouldSendG` flips).
   */
  private OnTimer(): void {
    // Check for abort via Ctrl+X (CAN = 0x18).
    while (this._Crt.KeyPressed()) {
      const KPE: KeyPressEvent | undefined = this._Crt.ReadKey();
      if (
        KPE !== undefined &&
        KPE.keyString.length > 0 &&
        KPE.keyString.charCodeAt(0) === this.CAN
      ) {
        this.Cancel('User requested abort');
      }
    }

    // Drain the connection until we run out of bytes or hit a
    // protocol decision that needs more data than we have.
    while (true) {
      // If we don't already have a peeked byte, try to read one.
      if (this._NextByte === 0) {
        if (this._Connection.bytesAvailable === 0) {
          // No data — keep the YMODEM-G "G" handshake alive after
          // 3s of quiet, but only when we're not actively in a
          // transfer (otherwise we'd send G into the middle of a
          // block and confuse the sender).
          if (this._ShouldSendG && new Date().getTime() - this._LastGTime > 3000) {
            try {
              this._Connection.writeByte(this.CAPG);
              this._Connection.flush();
            } catch (ioe) {
              // ioe1 in original
              this.HandleIOError(ioe);
              return;
            }

            this._LastGTime = new Date().getTime();
          }

          return;
        }
        try {
          this._NextByte = this._Connection.readUnsignedByte();
        } catch (ioe) {
          // ioe2 in original
          this.HandleIOError(ioe);
          return;
        }
      }

      // Dispatch based on the protocol byte.
      switch (this._NextByte) {
        case this.CAN:
          this.CleanUp('Sender requested abort');
          break;

        case this.SOH:
        case this.STX: {
          // We're inside a transfer now, stop the G-keepalive.
          this._ShouldSendG = false;

          // SOH → 128-byte blocks; STX → 1024-byte blocks.
          const BlockSize: number = this._NextByte === this.STX ? 1024 : 128;

          // Block header is: blockNumber, ~blockNumber, then
          // BlockSize bytes, then 2-byte CRC. If we don't have the
          // whole thing yet, leave _NextByte set and wait for more
          // data on the next tick.
          if (this._Connection.bytesAvailable < 1 + 1 + BlockSize + 1 + 1) {
            return;
          }

          // Consume the SOH/STX peek-byte.
          this._NextByte = 0;

          // Validate block numbers (each block carries its sequence
          // number and the bitwise complement; mismatched means
          // line noise or framing error).
          const InBlock: number = this._Connection.readUnsignedByte();
          const InBlockInverse: number = this._Connection.readUnsignedByte();
          if (InBlockInverse !== 255 - InBlock) {
            this.Cancel(
              'Bad block #: ' + InBlockInverse.toString() + ' !== 255-' + InBlock.toString()
            );
            return;
          }

          // Read the data and validate the CRC.
          const Packet: ByteArray = new ByteArray();
          this._Connection.readBytes(Packet, 0, BlockSize);
          const InCRC: number = this._Connection.readUnsignedShort();
          const OurCRC: number = CRC.Calculate16(Packet);
          if (InCRC !== OurCRC) {
            this.Cancel('Bad CRC: ' + InCRC.toString() + ' !== ' + OurCRC.toString());
            return;
          }

          if (this._ExpectingHeader) {
            // First block of a file: header packet (block 0).
            if (InBlock !== 0) {
              this.Cancel('Expecting header got block ' + InBlock.toString());
              return;
            }

            this._ExpectingHeader = false;

            // Parse filename (null-terminated string).
            let FileName = '';
            let B: number = Packet.readUnsignedByte();
            while (B !== 0 && Packet.bytesAvailable > 0) {
              FileName += String.fromCharCode(B);
              B = Packet.readUnsignedByte();
            }

            // Parse file size (ASCII digits).
            let Temp = '';
            B = Packet.readUnsignedByte();
            while (B >= 48 && B <= 57 && Packet.bytesAvailable > 0) {
              Temp += String.fromCharCode(B);
              B = Packet.readUnsignedByte();
            }
            const FileSize: number = parseInt(Temp, 10);

            // Empty filename means "no more files in the batch" —
            // YMODEM's batch-complete sentinel.
            if (FileName.length === 0) {
              this.CleanUp('File(s) successfully received!');
              return;
            }

            // Blank file size means a malformed header. YMODEM
            // technically allows 0-length files but this codepath
            // treats them as an error — preserved from the original.
            if (isNaN(FileSize) || FileSize === 0) {
              this.Cancel('File Size missing from header block');
              return;
            }

            this._File = new FileRecord(FileName, FileSize);
            this.lblFileCount.Text = 'Receiving file ' + (this._Files.length + 1).toString();
            this.lblFileName.Text = 'File Name: ' + FileName;
            this.lblFileSize.Text = 'File Size: ' + StringUtils.AddCommas(FileSize) + ' bytes';
            this.lblFileReceived.Text = 'File Recv: 0 bytes';
            this.pbFileReceived.Value = 0;
            this.pbFileReceived.Maximum = FileSize;

            // Send G to ask the sender to start the file body.
            try {
              this._Connection.writeByte(this.CAPG);
              this._Connection.flush();
            } catch (ioe) {
              // ioe3 in original
              this.HandleIOError(ioe);
              return;
            }
          } else {
            // Inside file body: append up to BlockSize bytes, but
            // not past the declared file size (the last block can
            // be partially-used; SUB padding is in the data but
            // not part of the real file).
            const BytesToWrite: number = Math.min(
              BlockSize,
              this._File.size - this._File.data.length
            );
            this._File.data.writeBytes(Packet, 0, BytesToWrite);
            this._TotalBytesReceived += BytesToWrite;

            this.lblFileReceived.Text =
              'File Recv: ' + StringUtils.AddCommas(this._File.data.length) + ' bytes';
            this.pbFileReceived.Value = this._File.data.length;
            this.lblTotalReceived.Text =
              'Total Recv: ' + StringUtils.AddCommas(this._TotalBytesReceived) + ' bytes';
          }
          break;
        }

        case this.EOT:
          // End of one file. Resume the G-keepalive so we'll nudge
          // the sender for the next file's header.
          this._ShouldSendG = true;

          // ACK the EOT and send a G to request the next header.
          try {
            this._Connection.writeByte(this.ACK);
            this._Connection.writeByte(this.CAPG);
            this._Connection.flush();
          } catch (ioe) {
            // ioe4 in original
            this.HandleIOError(ioe);
            return;
          }

          this._NextByte = 0;
          this._ExpectingHeader = true;
          this._Files.push(this._File);

          this.SaveFile(this._Files.length - 1);
          break;

        default:
          this.Cancel('Unexpected byte: ' + this._NextByte.toString());
          return;
      }
    }
  }

  /**
   * Trigger a browser download for the i-th received file using
   * `file-saver`.
   *
   * The intermediate step of going through a string and then
   * walking back to bytes is preserved from the original — slower
   * than reading directly from ByteArray into ArrayBuffer, but
   * functionally correct and not worth changing in a module that's
   * scheduled for replacement in Phase 4.
   */
  private SaveFile(index: number): void {
    const file = this._Files[index]!;
    const ByteString: string = file.data.toString();

    const Buffer: ArrayBuffer = new ArrayBuffer(ByteString.length);
    const View: DataView = new DataView(Buffer);
    for (let i = 0; i < ByteString.length; i++) {
      View.setUint8(i, ByteString.charCodeAt(i));
    }

    const FileBlob: Blob = new Blob([Buffer], { type: 'application/octet-binary' });
    saveAs(FileBlob, file.name);
  }
}
