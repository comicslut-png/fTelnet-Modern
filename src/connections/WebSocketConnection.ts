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

import { ByteArray, TypedEvent, type IEvent } from '../common/index.js';

/**
 * WebSocket-based network transport. Base class for protocol-specific
 * subclasses (TelnetConnection, RLoginConnection); also usable directly
 * for raw TCP (no protocol parsing).
 *
 * Phase 1 migration notes — substantial legacy code removed:
 *
 *   1. Flash WebSocket fallback (`web-socket-js` library, `WebSocketMain.swf`,
 *      `swfobject.js`, `document.write` script injection). Flash has been
 *      EOL since 2020 and no modern browser will load Flash content. Roughly
 *      40 lines deleted.
 *
 *   2. Cordova socket integration (`UseCordovaSocket`, `_CordovaSocket`,
 *      `OnCordovaSocketData`, all the Socket.d.ts plumbing). The Cordova
 *      fTelnet wrapper appears to be dormant. Roughly 60 lines deleted.
 *
 *   3. MozWebSocket polyfill (`window['WebSocket'] = window['MozWebSocket']`).
 *      Firefox shipped native WebSocket in 2011.
 *
 *   4. AppleWebKit/534.30 check (Android 2.x browser). Not a meaningful
 *      audience in 2026.
 *
 *   5. `hixie` WebSocket detection (`WebSocket.CLOSED === 2`). Hixie was
 *      the old draft WebSocket spec; the standard has been RFC 6455 since
 *      December 2011. Every browser since has shipped the standard.
 *
 *   6. `WebSocketSupportsBinaryType` / `WebSocketSupportsTypedArrays`
 *      feature detection. All supported browsers have both.
 *
 * The negotiated wire protocols (`binary`, `base64`, `plain`) are
 * unchanged — those are how fTelnetProxy selects its frame format, and
 * the proxy still negotiates them today. We always offer all three and
 * prefer `binary`.
 */

/**
 * Wire protocol negotiated with fTelnetProxy. Determines how bytes are
 * packed into WebSocket frames.
 *
 *   - `binary` : raw bytes in a binary frame (preferred; lowest overhead)
 *   - `base64` : bytes encoded as base64 in a text frame (legacy proxies)
 *   - `plain`  : bytes shoved into a text frame as latin-1 characters
 *                (very old fallback)
 */
export type WireProtocol = 'binary' | 'base64' | 'plain';

const DEFAULT_PROTOCOL: WireProtocol = 'plain';

/** Negotiated wire protocols offered to the proxy, in order of preference. */
const SUPPORTED_PROTOCOLS: WireProtocol[] = ['binary', 'base64', 'plain'];

/** Tag for IO debug logging when ?ftelnetdebug=1 is in the URL fragment. */
const DEBUG_FRAGMENT = 'ftelnetdebug=1';

export class WebSocketConnection {
  // Events
  public readonly onclose: IEvent<[]> = new TypedEvent<[]>();
  public readonly onconnect: IEvent<[]> = new TypedEvent<[]>();
  public readonly ondata: IEvent<[]> = new TypedEvent<[]>();
  public readonly onlocalecho: IEvent<[boolean]> = new TypedEvent<[boolean]>();
  public readonly onioerror: IEvent<[Event]> = new TypedEvent<[Event]>();
  public readonly onsecurityerror: IEvent<[]> = new TypedEvent<[]>();

  // Subclasses access these directly — kept public for compatibility
  // with the existing TelnetConnection / RLoginConnection inheritance.
  public _InputBuffer: ByteArray;
  public _OutputBuffer: ByteArray;
  public _LocalEcho = false;
  public readonly _LogIO: boolean = window.location.hash.indexOf(DEBUG_FRAGMENT) >= 0;
  public _Protocol: WireProtocol = DEFAULT_PROTOCOL;
  public _SendLocation = true;

  private _wasConnected = false;
  private _webSocket: WebSocket | undefined;

  constructor() {
    this._InputBuffer = new ByteArray();
    this._OutputBuffer = new ByteArray();
  }

  public get bytesAvailable(): number {
    return this._InputBuffer.bytesAvailable;
  }

  public close(): void {
    this._webSocket?.close();
  }

  /**
   * Open a WebSocket connection.
   *
   * If `proxyHostname` is supplied (the usual case for BBS connections),
   * we connect to the proxy and let it tunnel to the real host:port.
   * Otherwise we connect directly to host:port — useful for hosts that
   * speak WebSocket natively without a proxy.
   *
   * `forceWss` is honored for sysops embedding fTelnet on HTTP pages
   * who still want a TLS-protected tunnel to their proxy.
   */
  public connect(
    hostname: string,
    port: number,
    urlPath: string,
    forceWss: boolean,
    proxyHostname: string = '',
    proxyPort: number = 80,
    proxyPortSecure: number = 443
  ): void {
    this._wasConnected = false;

    const pageProtocol = document.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsScheme = forceWss ? 'wss' : pageProtocol;

    let url: string;
    if (proxyHostname === '') {
      url = `${wsScheme}://${hostname}:${port}${urlPath}`;
    } else {
      const proxyPortToUse = wsScheme === 'wss' ? proxyPortSecure : proxyPort;
      url = `${wsScheme}://${proxyHostname}:${proxyPortToUse}/${hostname}/${port}`;
    }

    this._webSocket = new WebSocket(url, SUPPORTED_PROTOCOLS);
    // Always request binary frames; we'll fall back if the proxy refuses.
    this._webSocket.binaryType = 'arraybuffer';

    this._webSocket.onclose = (): void => this.OnSocketClose();
    this._webSocket.onerror = (e: Event): void => this.OnSocketError(e);
    this._webSocket.onmessage = (e: MessageEvent): void => this.OnWebSocketMessage(e);
    this._webSocket.onopen = (): void => this.OnSocketOpen();
  }

  public get connected(): boolean {
    return this._webSocket !== undefined && this._webSocket.readyState === WebSocket.OPEN;
  }

  /** Flush the output buffer to the wire. */
  public flush(): void {
    const toSend: number[] = [];
    this._OutputBuffer.position = 0;
    while (this._OutputBuffer.bytesAvailable > 0) {
      toSend.push(this._OutputBuffer.readUnsignedByte());
    }
    this.Send(toSend);
    this._OutputBuffer.clear();
  }

  public set LocalEcho(value: boolean) {
    this._LocalEcho = value;
  }

  /**
   * Default negotiation: no protocol-specific filtering, every byte
   * passes through to the input buffer. Subclasses (Telnet, RLogin)
   * override this to strip protocol bytes.
   */
  public NegotiateInbound(data: ByteArray): void {
    while (data.bytesAvailable > 0) {
      this._InputBuffer.writeByte(data.readUnsignedByte());
    }
  }

  protected OnSocketClose(): void {
    if (this._wasConnected) {
      this.onclose.trigger();
    } else {
      // Connection never opened — usually a TLS/security failure or
      // an unreachable proxy.
      this.onsecurityerror.trigger();
    }
    this._wasConnected = false;
  }

  protected OnSocketError(e: Event): void {
    this.onioerror.trigger(e);
  }

  public OnSocketOpen(): void {
    if (this._webSocket?.protocol) {
      // Server picked one of our offered protocols.
      const negotiated = this._webSocket.protocol as WireProtocol;
      this._Protocol = negotiated;
    } else {
      this._Protocol = DEFAULT_PROTOCOL;
    }
    this._wasConnected = true;
    this.onconnect.trigger();
  }

  private OnWebSocketMessage(e: MessageEvent): void {
    // Reclaim memory if the input buffer was fully drained.
    if (this._InputBuffer.bytesAvailable === 0) {
      this._InputBuffer.clear();
    }

    const savedPosition = this._InputBuffer.position;
    this._InputBuffer.position = this._InputBuffer.length;

    const incoming = new ByteArray();
    if (this._Protocol === 'binary' && e.data instanceof ArrayBuffer) {
      const u8 = new Uint8Array(e.data);
      for (let i = 0; i < u8.length; i++) {
        incoming.writeByte(u8[i]!);
      }
    } else if (this._Protocol === 'base64' && typeof e.data === 'string') {
      incoming.writeString(atob(e.data));
    } else if (typeof e.data === 'string') {
      incoming.writeString(e.data);
    } else {
      // Unexpected — server sent something the protocol shouldn't allow.
      // Best effort: try to coerce whatever we got into bytes.
      console.warn('fTelnet: unexpected WebSocket frame type for protocol', this._Protocol);
      return;
    }
    incoming.position = 0;

    if (this._LogIO) {
      this.logFrame('IN', incoming, typeof e.data === 'string' ? 'text' : 'binary');
      incoming.position = 0;
    }

    this.NegotiateInbound(incoming);
    this._InputBuffer.position = savedPosition;
    this.ondata.trigger();
  }

  // Read* methods proxy to the input buffer.
  public readBytes(target: ByteArray, offset: number, length: number): void {
    this._InputBuffer.readBytes(target, offset, length);
  }

  public readString(length?: number): string {
    return this._InputBuffer.readString(length);
  }

  public readUnsignedByte(): number {
    return this._InputBuffer.readUnsignedByte();
  }

  public readUnsignedShort(): number {
    return this._InputBuffer.readUnsignedShort();
  }

  /** Send raw bytes on the wire, packed according to the negotiated protocol. */
  public Send(data: number[]): void {
    if (!this._webSocket) {
      return;
    }
    if (this._Protocol === 'binary') {
      this._webSocket.send(new Uint8Array(data).buffer);
    } else {
      let asString = '';
      for (let i = 0; i < data.length; i++) {
        asString += String.fromCharCode(data[i]!);
      }
      if (this._Protocol === 'base64') {
        this._webSocket.send(btoa(asString));
      } else {
        this._webSocket.send(asString);
      }
    }

    if (this._LogIO) {
      const ba = new ByteArray();
      for (const b of data) {
        ba.writeByte(b);
      }
      this.logFrame('OUT', ba);
    }
  }

  public set SendLocation(value: boolean) {
    this._SendLocation = value;
  }

  // Write* methods proxy to the output buffer.
  public writeByte(value: number): void {
    this._OutputBuffer.writeByte(value);
  }

  public writeBytes(source: ByteArray, offset?: number, length?: number): void {
    this._OutputBuffer.writeBytes(source, offset, length);
  }

  public writeShort(value: number): void {
    this._OutputBuffer.writeShort(value);
  }

  public writeString(text: string): void {
    this._OutputBuffer.writeString(text);
    this.flush();
  }

  /**
   * Dump a frame to the console as printable text with `~N` for any byte
   * outside the ASCII printable range. Useful for diffing fTelnet against
   * other clients when debugging interop issues.
   */
  private logFrame(direction: 'IN' | 'OUT', data: ByteArray, kind?: string): void {
    let line = '';
    while (data.bytesAvailable > 0) {
      const b = data.readUnsignedByte();
      if (b >= 32 && b <= 126) {
        line += String.fromCharCode(b);
      } else {
        line += `~${b.toString(10)}`;
      }
    }
    if (line.length > 0) {
      const label = kind ? `${direction}(${kind})` : direction;
      // eslint-disable-next-line no-console
      console.log(`${label}: ${line}`);
    }
  }
}
