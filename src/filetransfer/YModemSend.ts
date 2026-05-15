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
import { YModemSendState } from './YModemSendState.js';

/**
 * YMODEM-G batch file send over a WebSocket connection.
 *
 * Mirror of `YModemReceive`: builds a modal CRT progress dialog,
 * polls the connection on a 0ms setInterval timer, drives a state
 * machine (`YModemSendState`) through handshake → header → data
 * blocks → EOT → next file.
 *
 * Phase 1 migration notes match `YModemReceive`'s — this module is
 * also scheduled for removal in Phase 4 along with the rest of
 * YMODEM. Preserved as-is to keep the existing API stable until
 * then.
 */
export class YModemSend {
  // ───── Public events ─────
  public ontransfercomplete: IEvent = new TypedEvent();

  // ───── YMODEM protocol bytes ─────
  private readonly SOH = 0x01;
  private readonly STX = 0x02;
  private readonly EOT = 0x04;
  private readonly ACK = 0x06;
  private readonly NAK = 0x15;
  private readonly CAN = 0x18;
  private readonly SUB = 0x1a;
  private readonly CAPG: number = 'G'.charCodeAt(0);

  // ───── State machine & state ─────
  private _Block = 0;
  private readonly _Connection: WebSocketConnection;
  private readonly _Crt: Crt;
  private _EOTCount = 0;
  private _File!: FileRecord; // assigned in OnTimer before first read
  private _FileBytesSent = 0;
  private _FileCount = 0;
  private readonly _Files: FileRecord[] = [];
  private _State: YModemSendState = YModemSendState.WaitingForHeaderRequest;
  private _Timer: ReturnType<typeof setInterval> | undefined;
  private _TotalBytes = 0;
  private _TotalBytesSent = 0;

  // ───── Dialog elements (built in Upload()) ─────
  private lblFileCount!: CrtLabel;
  private lblFileName!: CrtLabel;
  private lblFileSize!: CrtLabel;
  private lblFileSent!: CrtLabel;
  // `lblTotalSize` was a private instance field in the original but
  // was never read after construction — only the CrtLabel constructor
  // side-effect (registering itself with the panel for rendering) is
  // actually used. With strict mode that flags an unused-field
  // warning. Moved to a local inside Upload() instead. Functionally
  // identical: the label still shows up on the dialog because
  // CrtLabel's constructor adds itself to its parent.
  private lblTotalSent!: CrtLabel;
  private lblStatus!: CrtLabel;
  private pbFileSent!: CrtProgressBar;
  private pbTotalSent!: CrtProgressBar;
  private pnlMain!: CrtPanel;

  constructor(crt: Crt, connection: WebSocketConnection) {
    this._Crt = crt;
    this._Connection = connection;
  }

  /**
   * Send the 5×CAN abort sequence plus the backspace-and-overwrite
   * cleanup. Drain the input. Tear down with the given reason.
   *
   * Same pattern as YModemReceive.Cancel().
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

    try {
      this._Connection.readString();
    } catch (ioe) {
      // ioe2 in original
      this.HandleIOError(ioe);
      return;
    }

    this.CleanUp('Cancelling (' + reason + ')');
  }

  /** Stop the timer, update the status, schedule dialog dismissal after 3s. */
  private CleanUp(message: string): void {
    clearInterval(this._Timer);

    this.lblStatus.Text = 'Status: ' + message;

    setTimeout((): void => {
      this.Dispatch();
    }, 3000);
  }

  /** Hide dialog, restore cursor, fire ontransfercomplete. */
  private Dispatch(): void {
    this.pnlMain.Hide();
    this._Crt.ShowCursor();

    this.ontransfercomplete.trigger();
  }

  /**
   * I/O error → log + tear down. `unknown` rather than `Error`
   * because TS strict-mode catch bindings are `unknown`.
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
   * Main poll: drain keypresses (Ctrl+X = abort), then drive the
   * state machine through one tick.
   *
   * The early return for "no bytes available and not actively
   * sending data" keeps us from spinning when there's nothing to
   * do — but the `SendingData` state pumps bytes out without
   * waiting on input, so we don't return early in that case.
   */
  private OnTimer(): void {
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

    if (this._State !== YModemSendState.SendingData && this._Connection.bytesAvailable === 0) {
      return;
    }

    let B = 0;
    switch (this._State) {
      case YModemSendState.WaitingForHeaderRequest:
        // Receiver kicks off by sending 'G' (capital, ASCII 0x47).
        try {
          B = this._Connection.readUnsignedByte();
        } catch (ioe) {
          // ioe1 in original
          this.HandleIOError(ioe);
          return;
        }

        if (B !== this.CAPG) {
          this.Cancel(
            'Expecting G got ' + B.toString() + ' (State=' + this._State.toString() + ')'
          );
          return;
        }

        // Drain any extra G's the receiver buffered up while we
        // were waiting for the user to pick a file.
        try {
          this._Connection.readString();
        } catch (ioe) {
          // ioe2 in original
          this.HandleIOError(ioe);
          return;
        }

        {
          const NextFile = this._Files.shift();
          if (NextFile === undefined) {
            // No more files → send the empty header packet that
            // tells the receiver "batch is done".
            this.SendEmptyHeaderBlock();
            this.CleanUp('File(s) successfully sent!');
            return;
          }
          this._File = NextFile;
        }

        this.lblFileCount.Text =
          'Sending file ' +
          (this._FileCount - this._Files.length).toString() +
          ' of ' +
          this._FileCount.toString();
        this.lblFileName.Text = 'File Name: ' + this._File.name;
        this.lblFileSize.Text =
          'File Size: ' + StringUtils.AddCommas(this._File.size) + ' bytes';
        this.lblFileSent.Text = 'File Sent: 0 bytes';
        this.pbFileSent.Value = 0;
        this.pbFileSent.Maximum = this._File.size;

        this.SendHeaderBlock();

        // Reset per-file counters for the new transfer.
        this._Block = 1;
        this._EOTCount = 0;
        this._FileBytesSent = 0;

        this._State = YModemSendState.WaitingForHeaderAck;
        return;

      case YModemSendState.WaitingForHeaderAck:
        try {
          B = this._Connection.readUnsignedByte();
        } catch (ioe) {
          // ioe3 in original
          this.HandleIOError(ioe);
          return;
        }

        if (B !== this.ACK && B !== this.CAPG) {
          this.Cancel(
            'Expecting ACK/G got ' + B.toString() + ' (State=' + this._State.toString() + ')'
          );
          return;
        }

        if (B === this.ACK) {
          this._State = YModemSendState.WaitingForFileRequest;
        } else if (B === this.CAPG) {
          // Async PRO doesn't ACK the header packet — the G that
          // comes back is actually the file-start request, not a
          // re-send signal. Jump straight to SendingData.
          this._State = YModemSendState.SendingData;
        }
        return;

      case YModemSendState.WaitingForFileRequest:
        try {
          B = this._Connection.readUnsignedByte();
        } catch (ioe) {
          // ioe4 in original
          this.HandleIOError(ioe);
          return;
        }

        if (B !== this.CAPG) {
          this.Cancel(
            'Expecting G got ' + B.toString() + ' (State=' + this._State.toString() + ')'
          );
          return;
        }

        this._State = YModemSendState.SendingData;
        return;

      case YModemSendState.SendingData:
        if (this.SendDataBlocks(16)) {
          // True = whole file sent (and EOT issued from inside
          // SendDataBlocks). Move to ack-waiting state.
          this._State = YModemSendState.WaitingForFileAck;
        }
        return;

      case YModemSendState.WaitingForFileAck:
        try {
          B = this._Connection.readUnsignedByte();
        } catch (ioe) {
          // ioe5 in original
          this.HandleIOError(ioe);
          return;
        }

        if (B !== this.ACK && B !== this.NAK) {
          this.Cancel(
            'Expecting (N)ACK got ' + B.toString() + ' (State=' + this._State.toString() + ')'
          );
          return;
        }

        if (B === this.ACK) {
          this._State = YModemSendState.WaitingForHeaderRequest;
        } else if (B === this.NAK) {
          // Receiver wants the EOT re-sent (rare, but valid).
          this.SendEOT();
        }
        return;

      default:
        return;
    }
  }

  /**
   * Send up to `blocks` data blocks (1024 bytes each, padded with
   * SUB if necessary). Returns true if the file is fully sent
   * (after issuing the EOT).
   *
   * Sending in batches of 16 per tick (the caller passes 16) is a
   * throughput optimization: each tick is bounded so we don't
   * starve the event loop, but we don't bottleneck on the timer
   * either. With 16×1024 = 16 KB per tick at a 0ms interval,
   * effective throughput is limited by the WebSocket write speed,
   * not by the timer.
   */
  private SendDataBlocks(blocks: number): boolean {
    for (let loop = 0; loop < blocks; loop++) {
      const BytesToRead: number = Math.min(1024, this._File.data.bytesAvailable);

      if (BytesToRead === 0) {
        // File fully read out → send EOT to signal end-of-file.
        this.SendEOT();
        return true;
      }

      const Packet: ByteArray = new ByteArray();
      this._File.data.readBytes(Packet, 0, BytesToRead);

      // Pad last partial block to 1024 with SUB (0x1A). Per YMODEM
      // spec — the receiver knows the real file size from the
      // header and ignores the trailing SUBs.
      if (Packet.length < 1024) {
        Packet.position = Packet.length;
        while (Packet.length < 1024) {
          Packet.writeByte(this.SUB);
        }
        Packet.position = 0;
      }

      try {
        this._Connection.writeByte(this.STX); // STX = 1024-byte block
        this._Connection.writeByte(this._Block % 256);
        this._Connection.writeByte(255 - (this._Block % 256));
        this._Connection.writeBytes(Packet);
        this._Connection.writeShort(CRC.Calculate16(Packet));
        this._Connection.flush();
      } catch (ioe) {
        this.HandleIOError(ioe);
        return false;
      }

      this._Block++;
      this._FileBytesSent += BytesToRead;
      this._TotalBytesSent += BytesToRead;

      this.lblFileSent.Text =
        'File Sent: ' + StringUtils.AddCommas(this._FileBytesSent) + ' bytes';
      this.pbFileSent.StepBy(BytesToRead);
      this.lblTotalSent.Text =
        'Total Sent: ' + StringUtils.AddCommas(this._TotalBytesSent) + ' bytes';
      this.pbTotalSent.StepBy(BytesToRead);
    }

    return false;
  }

  /**
   * Send the "batch complete" sentinel: a header packet (block 0)
   * with 128 null bytes. The receiver sees the empty filename and
   * knows the transfer is over.
   */
  private SendEmptyHeaderBlock(): void {
    const Packet: ByteArray = new ByteArray();

    for (let i = 0; i < 128; i++) {
      Packet.writeByte(0);
    }

    try {
      this._Connection.writeByte(this.SOH);
      this._Connection.writeByte(0);
      this._Connection.writeByte(255);
      this._Connection.writeBytes(Packet);
      this._Connection.writeShort(CRC.Calculate16(Packet));
      this._Connection.flush();
    } catch (ioe) {
      this.HandleIOError(ioe);
      return;
    }
  }

  /** Send a single EOT byte (end-of-file marker). */
  private SendEOT(): void {
    try {
      this._Connection.writeByte(this.EOT);
      this._Connection.flush();
    } catch (ioe) {
      this.HandleIOError(ioe);
      return;
    }
    this._EOTCount++;
  }

  /**
   * Build and send the header packet (block 0) for the current
   * file: filename, null terminator, file size as ASCII digits,
   * then padding out to 128 or 1024 bytes.
   *
   * Both 128 and 1024 byte headers are valid YMODEM. The chosen
   * size depends on payload length: if everything fits in 128 we
   * use SOH (small block), otherwise STX (large block). Beyond
   * 1024 bytes the original aborts with "Header packet exceeded
   * 1024 bytes" — preserved.
   */
  private SendHeaderBlock(): void {
    const Packet: ByteArray = new ByteArray();

    for (let i = 0; i < this._File.name.length; i++) {
      Packet.writeByte(this._File.name.charCodeAt(i));
    }

    // Null separator between name and size.
    Packet.writeByte(0);

    const Size: string = this._File.size.toString();
    for (let i = 0; i < Size.length; i++) {
      Packet.writeByte(Size.charCodeAt(i));
    }

    // Pad to 128 if under, else to 1024 if under that, else fail.
    if (Packet.length < 128) {
      while (Packet.length < 128) {
        Packet.writeByte(0);
      }
    } else if (Packet.length === 128) {
      // Exactly 128 — fits, no padding needed.
    } else if (Packet.length < 1024) {
      while (Packet.length < 1024) {
        Packet.writeByte(0);
      }
    } else if (Packet.length === 1024) {
      // Exactly 1024 — fits, no padding needed.
    } else {
      // Pathological filename causing >1024-byte header.
      this.Cancel('Header packet exceeded 1024 bytes!');
      return;
    }

    try {
      // SOH for 128-byte block, STX for 1024-byte block.
      this._Connection.writeByte(Packet.length === 128 ? this.SOH : this.STX);
      this._Connection.writeByte(0);
      this._Connection.writeByte(255);
      this._Connection.writeBytes(Packet);
      this._Connection.writeShort(CRC.Calculate16(Packet));
      this._Connection.flush();
    } catch (ioe) {
      this.HandleIOError(ioe);
      return;
    }
  }

  /**
   * Queue a file for upload. The first call also sets up the
   * dialog and starts the poll timer; subsequent calls (for batch
   * mode) just push onto the queue.
   *
   * The triggering condition for setup is "queue length equals
   * the declared fileCount" — i.e. wait until all the files have
   * been queued before showing the dialog. Otherwise the dialog
   * would show partial counts during enqueue.
   */
  public Upload(file: FileRecord, fileCount: number): void {
    this._FileCount = fileCount;
    this._Files.push(file);

    if (this._Files.length === fileCount) {
      this._Timer = setInterval((): void => {
        this.OnTimer();
      }, 0);

      // Sum total bytes for the overall progress bar.
      for (let i = 0; i < this._Files.length; i++) {
        this._TotalBytes += this._Files[i]!.size;
      }

      this._Crt.HideCursor();
      this.pnlMain = new CrtPanel(
        this._Crt,
        undefined,
        10,
        5,
        60,
        16,
        BorderStyle.Single,
        Crt.WHITE,
        Crt.BLUE,
        'YModem-G Send Status (Hit CTRL+X to abort)',
        ContentAlignment.TopLeft
      );
      this.lblFileCount = new CrtLabel(
        this._Crt,
        this.pnlMain,
        2,
        2,
        56,
        'Sending file 1 of ' + this._FileCount.toString(),
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
        'File Name: ' + this._Files[0]!.name,
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
        'File Size: ' + StringUtils.AddCommas(this._Files[0]!.size) + ' bytes',
        ContentAlignment.Left,
        Crt.YELLOW,
        Crt.BLUE
      );
      this.lblFileSent = new CrtLabel(
        this._Crt,
        this.pnlMain,
        2,
        6,
        56,
        'File Sent: 0 bytes',
        ContentAlignment.Left,
        Crt.YELLOW,
        Crt.BLUE
      );
      this.pbFileSent = new CrtProgressBar(
        this._Crt,
        this.pnlMain,
        2,
        7,
        56,
        ProgressBarStyle.Continuous
      );
      // lblTotalSize: see comment near the class field declarations.
      // Stored in a `void`'d local so the constructor side-effect
      // (showing the "Total Size" label on the dialog) still fires,
      // without triggering the unused-variable rule.
      void new CrtLabel(
        this._Crt,
        this.pnlMain,
        2,
        9,
        56,
        'Total Size: ' + StringUtils.AddCommas(this._TotalBytes) + ' bytes',
        ContentAlignment.Left,
        Crt.YELLOW,
        Crt.BLUE
      );
      this.lblTotalSent = new CrtLabel(
        this._Crt,
        this.pnlMain,
        2,
        10,
        56,
        'Total Sent: 0 bytes',
        ContentAlignment.Left,
        Crt.YELLOW,
        Crt.BLUE
      );
      this.pbTotalSent = new CrtProgressBar(
        this._Crt,
        this.pnlMain,
        2,
        11,
        56,
        ProgressBarStyle.Continuous
      );
      this.pbTotalSent.Maximum = this._TotalBytes;
      this.lblStatus = new CrtLabel(
        this._Crt,
        this.pnlMain,
        2,
        13,
        56,
        'Status: Transferring file(s)',
        ContentAlignment.Left,
        Crt.WHITE,
        Crt.BLUE
      );
    }
  }
}
