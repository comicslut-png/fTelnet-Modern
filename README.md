# fTelnet (modernized)

An HTML5 WebSocket client for connecting to BBSes and other text-mode
hosts. This repository is a modernization fork of the original fTelnet
by Rick Parrish (R&M Software), bringing the codebase from 2017-era
TypeScript to a current toolchain while preserving every feature and
the BBS-era aesthetic.

## Status

This is **Phase 1** of a multi-phase modernization. Phase 1 swaps out
the foundation (TypeScript version, build system, module structure,
test framework) without changing user-visible behavior.

| Phase                                                                | Status      |
| -------------------------------------------------------------------- | ----------- |
| 1. Modernize foundation (TS 5, Vite, ESM, strict, tests)             | In progress |
| 2. Refactor UI layer into Lit Web Components                         | Planned     |
| 3. Neo-retro chrome facelift (settings panel, themes, modern dialogs) | Planned     |
| 4. ZMODEM file transfer (replaces YModem as default)                 | Planned     |
| 5. Polish (PWA, performance, docs, embed wizard refresh)             | Planned     |

See `docs/PHASE_1_MIGRATION_GUIDE.md` for the details of what changed.

## Quick start

```bash
npm install         # install dependencies
npm run dev         # start dev server with hot reload
npm test            # run the test suite
npm run build:all   # produce all four bundle flavors
```

Output bundles land in `dist/`:

- `ftelnet.norip.noxfer.js` — ANSI/BBS only, smallest bundle
- `ftelnet.norip.xfer.js` — adds YModem (and later ZMODEM) file transfer
- `ftelnet.rip.noxfer.js` — adds RIPscrip graphics emulation
- `ftelnet.rip.xfer.js` — everything

Each comes with a source map and a minified `.min.js` variant.

## Embedding

The public API matches the original fTelnet exactly:

```html
<div id="fTelnetContainer"></div>
<script src="ftelnet.norip.xfer.min.js" id="fTelnetScript"></script>
<script>
  const options = new fTelnetOptions();
  options.Hostname = 'bbs.ftelnet.ca';
  options.Port = 1123;
  const client = new fTelnetClient('fTelnetContainer', options);
</script>
```

Existing sysop integrations continue to work unchanged.

## License

GNU Affero General Public License v3, matching upstream fTelnet.
See `LICENSE`.

## Acknowledgements

Original fTelnet © Rick Parrish, R&M Software. The hard work — the
ANSI/CTERM parser, RIPscrip interpreter, telnet negotiation, font
collection, and architectural design — is his. This fork is
maintenance and modernization on top of that foundation.
