/**
 * Public exports for the ftelnetclient module.
 *
 * This is the top-level glue that wires all the other modules
 * together into a working BBS client. After Phase 1, importing
 * `fTelnetClient` and `fTelnetOptions` is enough to embed
 * fTelnet in a web page.
 *
 * Phase 2 Stage 6 dropped the VirtualKeyboard export: that class
 * was replaced by the `<f-virtual-keyboard>` Lit component
 * (`@components/FVirtualKeyboard`). Callers that need the keyboard
 * directly should import from `@components/index.js`.
 */
export { fTelnetClient } from './fTelnetClient.js';
export { fTelnetOptions } from './fTelnetOptions.js';
