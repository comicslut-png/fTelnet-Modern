/*
  fTelnet-Modern dev entry.

  Constructs a single fTelnetClient pointing at bbs.ftelnet.ca via the
  fTelnet public WebSocket-to-TCP proxy (the same config the original
  release/index.html shipped with).

  In production this file isn't used — sysops include the IIFE bundle
  via <script> and call `new fTelnetClient(...)` themselves. This is
  purely for `npm run dev` smoke-testing during Phase 2 development.

  To change targets, edit the Options below or set them via the
  browser console:

      Client.Connection?.close()   // disconnect first
      // ... then construct a new client with different options

  Useful console-accessible globals (window.Client, window.Options) are
  exposed for debugging — see the bottom of this file.
*/

import { fTelnetClient, fTelnetOptions } from './ftelnetclient/index.js';

const Options = new fTelnetOptions();
Options.Theme = 'dos-classic';
Options.Hostname = 'bbs.ftelnet.ca';


// Direct WebSocket connection (commented out — bbs.ftelnet.ca doesn't
// speak WebSocket natively, so we need the proxy below):
// Options.Port = 23;

// Proxied connection via fTelnet's public WebSocket-to-TCP proxy. This
// matches the release/index.html config in the original repo. The
// proxy translates WebSocket frames to/from raw TCP telnet bytes.
Options.Port = 23;
Options.ProxyHostname = 'p-us-east.ftelnet.ca';
Options.ProxyPort = 80;
Options.ProxyPortSecure = 443;
Options.AllowMenu   = true;
Options.AllowResize = true;
Options.ScreenColumns = 80;
Options.ScreenRows    = 25;

const Client = new fTelnetClient('fTelnetContainer', Options);

// Expose for browser-console debugging. Both `window.Client` and
// `window.Options` are useful when poking at state in DevTools.
declare global {
  interface Window {
    Client: fTelnetClient;
    Options: fTelnetOptions;
  }
}
window.Client = Client;
window.Options = Options;

// eslint-disable-next-line no-console
console.log('[fTelnet-Modern dev] Client ready. window.Client / window.Options available.');
