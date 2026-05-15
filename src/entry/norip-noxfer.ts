/*
  IIFE bundle entry — norip-noxfer flavor (ANSI/BBS only, no RIPscrip, no file transfer).

  Sysops embed this file via <script id="fTelnetScript" src="...">. It
  exposes fTelnetClient and fTelnetOptions as window globals so the
  classic embed pattern `new fTelnetClient(...)` still works without
  any code changes from the original fTelnet.

  Phase 2 note: all four flavors currently re-export the same modules.
  True flavor-specific tree-shaking (norip dropping the RIP module,
  noxfer dropping filetransfer) requires conditional imports in
  fTelnetClient itself — a refactor scheduled for a later delta. For
  now the four flavors are identical in size; the filename distinction
  is preserved for backward compatibility with existing embed wizards.
*/

import { fTelnetClient, fTelnetOptions } from '../ftelnetclient/index.js';

declare global {
  interface Window {
    fTelnetClient: typeof fTelnetClient;
    fTelnetOptions: typeof fTelnetOptions;
  }
}

window.fTelnetClient = fTelnetClient;
window.fTelnetOptions = fTelnetOptions;
