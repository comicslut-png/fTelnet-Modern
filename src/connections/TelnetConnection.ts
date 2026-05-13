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

import { ByteArray } from '../common/index.js';
import { TelnetCommand } from './TelnetCommand.js';
import { TelnetNegotiationState } from './TelnetNegotiationState.js';
import { TelnetOption } from './TelnetOption.js';
import { WebSocketConnection } from './WebSocketConnection.js';
import type { WindowSizeSource } from './WindowSizeSource.js';

/**
 * Endpoint queried by `HandleSendLocation` to discover the client's
 * public IP for the SEND-LOCATION subnegotiation. Lifted out as a
 * module constant so tests and future feature work can stub it
 * without touching the negotiation code.
 */
const PUBLIC_IP_ENDPOINT = 'https://text.wtfismyip.com/';

/**
 * Telnet protocol connection.
 *
 * Layers RFC 854 telnet on top of the WebSocket transport. Handles:
 *   - IAC escape parsing on the input stream
 *   - IAC escape doubling on the output stream
 *   - Option negotiation (WILL/WONT/DO/DONT)
 *   - Subnegotiation for: TerminalType, WindowSize (NAWS), SendLocation
 *   - Suppression of options we don't speak (LineMode, etc.)
 *
 * Phase 1 migration notes:
 *   - `_Crt: Crt` is now `_windowSize: WindowSizeSource` — see
 *     WindowSizeSource.ts for rationale.
 *   - All `var` → `const`/`let`, types tightened, JSDoc added.
 *   - The dead-code block in `HandleTerminalLocationNumber` (after an
 *     unconditional `return`) is removed. The comment explaining why
 *     this option is refused is preserved.
 *   - Behavior — including the order of negotiation responses, which
 *     options we WILL/WONT, and IAC escape handling — is unchanged.
 */
export class TelnetConnection extends WebSocketConnection {
  private readonly _windowSize: WindowSizeSource;
  private readonly _negotiatedOptions: number[];
  private _negotiationState: TelnetNegotiationState;
  private _subnegotiationData: ByteArray;
  private _subnegotiationOption: TelnetOption;
  private _terminalTypeIndex: number;
  private readonly _terminalTypes: string[];

  constructor(windowSize: WindowSizeSource, emulation: string) {
    super();
    this._windowSize = windowSize;

    // 256-slot table tracks our last response to each option negotiation.
    // Used to suppress duplicate negotiation responses (some BBSes will
    // re-DO an option we've already WILL'd, and we shouldn't reply twice).
    this._negotiatedOptions = new Array<number>(256).fill(0);
    this._negotiationState = TelnetNegotiationState.Data;

    // Subnegotiation buffer is reset when an SB sequence starts, but
    // we initialize it here so it's never undefined.
    this._subnegotiationData = new ByteArray();
    this._subnegotiationOption = TelnetOption.TransmitBinary;

    // Build the rotating list of terminal types reported via
    // TerminalType subnegotiation. Servers may ask multiple times,
    // expecting the answer to change — when they stop seeing new ones,
    // they know we've exhausted our list.
    this._terminalTypeIndex = 0;
    this._terminalTypes = [emulation];
    if (this._terminalTypes.indexOf('ansi-bbs') === -1) {
      this._terminalTypes.push('ansi-bbs');
    }
    if (this._terminalTypes.indexOf('ansi') === -1) {
      this._terminalTypes.push('ansi');
    }
    if (this._terminalTypes.indexOf('cp437') === -1) {
      this._terminalTypes.push('cp437');
    }
    // Repeat the final entry so the server sees a stable value when
    // it stops getting new ones — this is the conventional signal that
    // we've cycled through everything we have.
    this._terminalTypes.push(this._terminalTypes[this._terminalTypes.length - 1]!);
  }

  /**
   * Flush the output buffer, escaping any literal 0xFF (IAC) byte by
   * doubling it. Without this, sending a high-bit-set 8-bit graphic
   * character that happens to be 0xFF would be misinterpreted as a
   * telnet command by the receiver.
   */
  public override flush(): void {
    const toSend: number[] = [];
    this._OutputBuffer.position = 0;
    while (this._OutputBuffer.bytesAvailable > 0) {
      const b = this._OutputBuffer.readUnsignedByte();
      toSend.push(b);
      if (b === TelnetCommand.IAC) {
        toSend.push(TelnetCommand.IAC);
      }
    }
    this.Send(toSend);
    this._OutputBuffer.clear();
  }

  private HandleAreYouThere(): void {
    // Respond to an AYT with a literal `.` so the server has something
    // to show the user that the connection is alive.
    this.Send(['.'.charCodeAt(0)]);
  }

  private HandleEcho(command: number): void {
    switch (command) {
      case TelnetCommand.Do:
        this.SendWill(TelnetOption.Echo);
        this._LocalEcho = true;
        this.onlocalecho.trigger(this._LocalEcho);
        break;
      case TelnetCommand.Dont:
        this.SendWont(TelnetOption.Echo);
        this._LocalEcho = false;
        this.onlocalecho.trigger(this._LocalEcho);
        break;
      case TelnetCommand.Will:
        this.SendDo(TelnetOption.Echo);
        this._LocalEcho = false;
        this.onlocalecho.trigger(this._LocalEcho);
        break;
      case TelnetCommand.Wont:
        this.SendDont(TelnetOption.Echo);
        this._LocalEcho = true;
        this.onlocalecho.trigger(this._LocalEcho);
        break;
      default:
        // Unknown echo command byte; nothing to do.
        break;
    }
  }

  /**
   * Send the client's public IP address to the server as part of the
   * SEND-LOCATION subnegotiation (RFC 779). Looked up via an external
   * service because the browser can't observe its own outbound IP.
   *
   * Failures are silent — sysops shouldn't see error popups for a
   * cosmetic feature.
   */
  private HandleSendLocation(): void {
    if (!this._SendLocation) {
      this.SendWont(TelnetOption.SendLocation);
      return;
    }
    try {
      // Switched from XMLHttpRequest to fetch as part of the migration
      // — same behavior, modern API. If the user is offline or the
      // service is down, we just skip sending the location.
      fetch(PUBLIC_IP_ENDPOINT)
        .then((response) => {
          if (!response.ok) {
            // eslint-disable-next-line no-console
            console.log(`failed to get remote ip, status=${response.status}`);
            return null;
          }
          return response.text();
        })
        .then((text) => {
          if (text === null) {
            return;
          }
          this.SendWill(TelnetOption.SendLocation);
          this.SendSubnegotiate(TelnetOption.SendLocation);

          const trimmed = text.trim();
          const toSend: number[] = [];
          for (let i = 0; i < trimmed.length; i++) {
            const cc = trimmed.charCodeAt(i);
            toSend.push(cc);
            if (cc === TelnetCommand.IAC) {
              toSend.push(TelnetCommand.IAC);
            }
          }
          this.Send(toSend);
          this.SendSubnegotiateEnd();
        })
        .catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.log('failed to get remote ip:', err);
        });
    } catch (e: unknown) {
      // eslint-disable-next-line no-console
      console.log('failed to get remote ip:', e);
    }
  }

  private HandleTerminalType(): void {
    this.SendSubnegotiate(TelnetOption.TerminalType);
    const terminalType = this._terminalTypes[this._terminalTypeIndex]!;
    const toSend: number[] = [0]; // IS
    for (let i = 0; i < terminalType.length; i++) {
      toSend.push(terminalType.charCodeAt(i));
    }
    this.Send(toSend);
    this.SendSubnegotiateEnd();

    if (this._terminalTypeIndex < this._terminalTypes.length - 1) {
      this._terminalTypeIndex += 1;
    } else {
      this._terminalTypeIndex = 0;
    }
  }

  /**
   * RFC 946 TERMINAL-LOCATION-NUMBER is intentionally refused.
   *
   * The option only supports a 32-bit IPv4 address, so we can't use it
   * for IPv6 clients. fTelnet uses SEND-LOCATION (RFC 779) instead,
   * which accepts arbitrary-length ASCII addresses.
   */
  private HandleTerminalLocationNumber(): void {
    this.SendWont(TelnetOption.TerminalLocationNumber);
  }

  /**
   * Respond to the server's window-size query with NAWS data.
   * NAWS sends width then height, each as a big-endian 16-bit value.
   */
  private HandleWindowSize(): void {
    this.SendWill(TelnetOption.WindowSize);
    this.SendSubnegotiate(TelnetOption.WindowSize);

    const sizeBytes = [
      (this._windowSize.WindCols >> 8) & 0xff,
      this._windowSize.WindCols & 0xff,
      (this._windowSize.WindRows >> 8) & 0xff,
      this._windowSize.WindRows & 0xff,
    ];

    const toSend: number[] = [];
    for (const b of sizeBytes) {
      toSend.push(b);
      if (b === TelnetCommand.IAC) {
        toSend.push(TelnetCommand.IAC);
      }
    }
    this.Send(toSend);
    this.SendSubnegotiateEnd();
  }

  public override set LocalEcho(value: boolean) {
    this._LocalEcho = value;
    if (this.connected) {
      if (this._LocalEcho) {
        this.SendWill(TelnetOption.Echo);
      } else {
        this.SendWont(TelnetOption.Echo);
      }
    }
  }

  /**
   * Walk the incoming byte stream, splitting it into:
   *   - regular data bytes (written to the input buffer)
   *   - protocol commands (consumed silently or replied to)
   *
   * The state machine is identical to the original; only the loop
   * structure has been cleaned up.
   */
  public override NegotiateInbound(data: ByteArray): void {
    while (data.bytesAvailable > 0) {
      const b = data.readUnsignedByte();
      this._negotiationState = this.stepNegotiation(b);
    }
  }

  /**
   * Process one byte of input through the negotiation state machine.
   * Returns the new state. Pulled out as a method for testability —
   * tests can drive the state machine byte-by-byte without needing a
   * real WebSocket.
   */
  private stepNegotiation(b: number): TelnetNegotiationState {
    switch (this._negotiationState) {
      case TelnetNegotiationState.Data:
        if (b === TelnetCommand.IAC) {
          return TelnetNegotiationState.IAC;
        }
        this._InputBuffer.writeByte(b);
        return TelnetNegotiationState.Data;

      case TelnetNegotiationState.IAC:
        if (b === TelnetCommand.IAC) {
          // Escaped 0xFF — it's a literal data byte.
          this._InputBuffer.writeByte(b);
          return TelnetNegotiationState.Data;
        }
        switch (b) {
          case TelnetCommand.NoOperation:
          case TelnetCommand.DataMark:
          case TelnetCommand.Break:
          case TelnetCommand.InterruptProcess:
          case TelnetCommand.AbortOutput:
          case TelnetCommand.EraseCharacter:
          case TelnetCommand.EraseLine:
          case TelnetCommand.GoAhead:
            // Recognized but ignored.
            return TelnetNegotiationState.Data;
          case TelnetCommand.AreYouThere:
            this.HandleAreYouThere();
            return TelnetNegotiationState.Data;
          case TelnetCommand.Do:
            return TelnetNegotiationState.Do;
          case TelnetCommand.Dont:
            return TelnetNegotiationState.Dont;
          case TelnetCommand.Will:
            return TelnetNegotiationState.Will;
          case TelnetCommand.Wont:
            return TelnetNegotiationState.Wont;
          case TelnetCommand.Subnegotiation:
            return TelnetNegotiationState.Subnegotiation;
          default:
            return TelnetNegotiationState.Data;
        }

      case TelnetNegotiationState.Do:
        this.handleDo(b);
        return TelnetNegotiationState.Data;

      case TelnetNegotiationState.Dont:
        this.handleDont(b);
        return TelnetNegotiationState.Data;

      case TelnetNegotiationState.Will:
        this.handleWill(b);
        return TelnetNegotiationState.Data;

      case TelnetNegotiationState.Wont:
        this.handleWont(b);
        return TelnetNegotiationState.Data;

      case TelnetNegotiationState.Subnegotiation:
        this._subnegotiationOption = b as TelnetOption;
        this._subnegotiationData = new ByteArray();
        return TelnetNegotiationState.SubnegotiationData;

      case TelnetNegotiationState.SubnegotiationData:
        if (b === TelnetCommand.IAC) {
          return TelnetNegotiationState.SubnegotiationIAC;
        }
        this._subnegotiationData.writeByte(b);
        return TelnetNegotiationState.SubnegotiationData;

      case TelnetNegotiationState.SubnegotiationIAC:
        if (b === TelnetCommand.IAC) {
          // Escaped 0xFF inside subnegotiation data.
          this._subnegotiationData.writeByte(b);
          return TelnetNegotiationState.SubnegotiationData;
        }
        // Properly this is an IAC SE pair; anything else is a protocol
        // violation. We accept either and dispatch the option.
        switch (this._subnegotiationOption) {
          case TelnetOption.TerminalType:
            this.HandleTerminalType();
            break;
          default:
            // Other subnegotiations are ignored.
            break;
        }
        return TelnetNegotiationState.Data;

      default:
        return TelnetNegotiationState.Data;
    }
  }

  /** Server requested DO option. Reply with our willingness. */
  private handleDo(option: number): void {
    switch (option) {
      case TelnetCommand.AreYouThere:
        // TradeWars Game Server bug: it sends DO AYT and expects a reply.
        // RFC says AYT is a command, not an option; we humor TWGS anyway.
        this.SendWill(TelnetCommand.AreYouThere);
        this._negotiatedOptions[TelnetCommand.AreYouThere] = 0;
        break;
      case TelnetOption.TransmitBinary:
        this.SendWill(option);
        break;
      case TelnetOption.Echo:
        this.HandleEcho(TelnetCommand.Do);
        break;
      case TelnetOption.SuppressGoAhead:
        this.SendWill(option);
        break;
      case TelnetOption.SendLocation:
        this.HandleSendLocation();
        break;
      case TelnetOption.TerminalLocationNumber:
        this.HandleTerminalLocationNumber();
        break;
      case TelnetOption.TerminalType:
        this.SendWill(option);
        break;
      case TelnetOption.WindowSize:
        this.HandleWindowSize();
        break;
      default:
        this.SendWont(option);
        break;
    }
  }

  /** Server requested DONT option. Confirm by refusing. */
  private handleDont(option: number): void {
    switch (option) {
      case TelnetOption.TransmitBinary:
        this.SendWill(option);
        break;
      case TelnetOption.Echo:
        this.HandleEcho(TelnetCommand.Dont);
        break;
      case TelnetOption.SuppressGoAhead:
        this.SendWill(option);
        break;
      default:
        this.SendWont(option);
        break;
    }
  }

  /** Server announced WILL option. Reply with our acceptance. */
  private handleWill(option: number): void {
    switch (option) {
      case TelnetOption.TransmitBinary:
        this.SendDo(option);
        break;
      case TelnetOption.Echo:
        this.HandleEcho(TelnetCommand.Will);
        break;
      case TelnetOption.SuppressGoAhead:
        this.SendDo(option);
        break;
      case TelnetOption.TerminalType:
        this.SendDo(option);
        break;
      default:
        this.SendDont(option);
        break;
    }
  }

  /** Server announced WONT option. Acknowledge. */
  private handleWont(option: number): void {
    switch (option) {
      case TelnetOption.TransmitBinary:
        this.SendDo(option);
        break;
      case TelnetOption.Echo:
        this.HandleEcho(TelnetCommand.Wont);
        break;
      case TelnetOption.SuppressGoAhead:
        this.SendDo(option);
        break;
      default:
        this.SendDont(option);
        break;
    }
  }

  public override OnSocketOpen(): void {
    super.OnSocketOpen();
    if (this._LocalEcho) {
      this.SendWill(TelnetOption.Echo);
    } else {
      this.SendWont(TelnetOption.Echo);
    }
    if (this._SendLocation) {
      this.SendWill(TelnetOption.SendLocation);
    }
  }

  /**
   * Helpers for sending negotiation commands. Each one suppresses
   * sending the same command twice for the same option — needed because
   * some BBSes will repeatedly issue DO/WILL for options we've already
   * acknowledged, and replying every time creates a loop.
   */
  private SendDo(option: number): void {
    this.sendOption(option, TelnetCommand.Do);
  }
  private SendDont(option: number): void {
    this.sendOption(option, TelnetCommand.Dont);
  }
  private SendWill(option: number): void {
    this.sendOption(option, TelnetCommand.Will);
  }
  private SendWont(option: number): void {
    this.sendOption(option, TelnetCommand.Wont);
  }

  private sendOption(option: number, command: TelnetCommand): void {
    if (this._negotiatedOptions[option] === command) {
      if (this._LogIO) {
        // eslint-disable-next-line no-console
        console.log(`Duplicate ${TelnetCommand[command]} ${option}`);
      }
      return;
    }
    this._negotiatedOptions[option] = command;
    this.Send([TelnetCommand.IAC, command, option]);
    if (this._LogIO) {
      // eslint-disable-next-line no-console
      console.log(`${TelnetCommand[command]} ${option}`);
    }
  }

  private SendSubnegotiate(option: number): void {
    this.Send([TelnetCommand.IAC, TelnetCommand.Subnegotiation, option]);
  }

  private SendSubnegotiateEnd(): void {
    this.Send([TelnetCommand.IAC, TelnetCommand.EndSubnegotiation]);
  }
}
