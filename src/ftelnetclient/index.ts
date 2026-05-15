/**
 * Public exports for the ftelnetclient module.
 *
 * This is the top-level glue that wires all the other modules
 * together into a working BBS client. After Phase 1, importing
 * `fTelnetClient` and `fTelnetOptions` is enough to embed
 * fTelnet in a web page.
 */
export { fTelnetClient } from './fTelnetClient.js';
export { fTelnetOptions } from './fTelnetOptions.js';
export { VirtualKeyboard } from './VirtualKeyboard.js';
