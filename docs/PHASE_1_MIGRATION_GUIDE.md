# fTelnet Modernization — Phase 1 Migration Guide

This document records what changed during Phase 1 and why. It's
intended for anyone returning to the codebase after the modernization
and wondering "why is this different from the upstream fTelnet?"

## Goals of Phase 1

A modern TypeScript project that produces functionally identical
output to the original fTelnet, but built on tooling you can work in
for the next several years. **No user-visible behavior changes.**

## What changed

### Build system

| Before                                                       | After                              |
| ------------------------------------------------------------ | ---------------------------------- |
| `build.cmd` (Windows batch)                                  | `pnpm build` (cross-platform)      |
| `tsc --build source` + hand-rolled `postbuild.js`            | Vite                               |
| `jsmin` (last meaningful update: 2008)                       | esbuild (built into Vite)          |
| String-concatenated output                                   | Proper ES modules + IIFE bundle    |
| No source maps                                               | Source maps for every output       |
| No dev server                                                | `pnpm dev` with hot reload         |
| Seven separate `tsconfig.json` files for "project references" | One root `tsconfig.json`           |

### TypeScript

| Before              | After                                          |
| ------------------- | ---------------------------------------------- |
| TypeScript 4.1      | TypeScript 5.x                                 |
| `target: "es5"`     | `target: "ES2020"`                             |
| `module: "none"`    | `module: "ESNext"` with real `import`/`export` |
| No strict mode      | `strict: true`                                 |
| 983 `var` usages    | 0 `var`; `let` / `const` throughout            |
| `any` everywhere    | Proper types, generic `TypedEvent<TArgs>`      |
| `noUnusedLocals`: off | `noUnusedLocals`: on                         |

### Code quality tooling

New: ESLint (with `@typescript-eslint`), Prettier, Vitest. All configured
to work together. `pnpm test` runs the suite; `pnpm lint` / `pnpm format`
run the linter and formatter.

### Removed: Legacy browser shims

The following were stripped:

- **Flash WebSocket fallback** — `WebSocketMain.swf`, `swfobject.js`,
  `web_socket.js`, and the `document.write` script-injection block in
  `WebSocketConnection.ts`. Flash has been EOL since 2020.
- **Cordova mobile-app wrapper** — every `window.cordova` check, the
  `UseCordovaSocket` constant, and the `Socket.d.ts` declaration. The
  Cordova fTelnet wrapper appears to be dormant.
- **MozWebSocket** — Firefox 6.0 (2011) ships native WebSocket.
- **AppleWebKit/534.30 check** — Android 2.x Browser. Not a meaningful
  audience in 2026.
- **`document.execCommand('copy'/'paste')`** — replaced with
  `navigator.clipboard.{readText,writeText}`. This is the only
  behavior-level change in Phase 1 (callers are now async).
- **`window.clipboardData`** — IE-specific path.

These removals delete several hundred lines of code that nobody can
exercise anymore, and they unblock the future ability to use modern APIs
without a fallback ladder.

## Source-tree changes

Old layout (`source/`):

```
source/
  common/        each module a separate "TypeScript project"
  connections/   with its own tsconfig.json
  crt/           reference path comments at the top of every file
  crtcontrols/   classes are global; no imports/exports
  filetransfer/
  graph/
  ftelnetclient/
```

New layout (`src/`):

```
src/
  common/        proper ES modules with explicit imports
  connections/   single root tsconfig.json
  crt/           classes are exported, no globals
  crtcontrols/   path aliases: @common, @connections, etc.
  filetransfer/  each module has an index.ts barrel export
  graph/
  ftelnetclient/
  entry/         per-flavor entry points for the four bundle variants
```

Original file headers (the AGPL boilerplate) are preserved in every
migrated file. Original class names are preserved on the exported types
(e.g. `class Ansi`, `class ByteArray`) so external callers using the
documented public API don't break.

## Behavioral changes — read this carefully

Phase 1 is *almost* a pure refactor, but two things shift:

1. **`ClipboardHelper.GetData()` / `SetData()` are now async.** They
   return `Promise<string>` and `Promise<void>` respectively. Any
   internal caller has been updated; if you're consuming fTelnet's
   internals directly (unsupported but possible), you'll need to add
   `await`. The user-facing behavior is the same — copy/paste still
   works from the menu — but failure modes are different. Browsers
   may now refuse clipboard access if the page isn't served over
   HTTPS, and we surface that as a thrown error instead of silently
   falling back to a `prompt()`.

2. **Browsers without `WebSocket`, `Canvas`, `localStorage`, and
   `navigator.clipboard` are no longer supported.** This means
   effectively any browser released since ~2018 works fine. IE
   (including IE 11), pre-Chromium Edge, and very old Safari are
   out. This was already the de facto state — the Flash fallback
   hadn't worked since Flash died — but it's now explicit.

The original embed API (`new fTelnetClient(containerId, options)`) and
every option in `fTelnetOptions` are preserved exactly.

## Bug fixes incidental to migration

A few real bugs were spotted while migrating and are fixed in place:

- **`TypedEvent.off()`**: the original loop had `l++` where it
  needed `i++`, which would cause an infinite loop when removing a
  specific (non-anonymous) listener from a non-trivial listener list.
  Test added: `TypedEvent.test.ts` → "removes a specific listener via
  off()".
- **`Offset.ts`**: the fallback path for browsers without
  `getBoundingClientRect` was dead code (every supported browser has
  the method); removed it. The returned object's field order
  (`{ y, x }`) was also corrected to use the proper `Point`
  constructor (`new Point(x, y)`).

Several `// TODOX` markers that were genuinely TODOs (rather than known
bugs) have been cleaned up where the change was a one-line fix; harder
ones are left in place.

## What's NOT done in Phase 1

These are explicitly deferred to later phases — don't be alarmed by
their absence:

- **No UI changes whatsoever.** The status bar is still flat blue, the
  scrollback bar is still flat green, the menu is still the bare
  imperative `document.createElement` construction in `fTelnetClient.ts`.
  That's Phase 3.
- **No ZMODEM.** YModem still works as before. That's Phase 4.
- **No new features.** Phase 1 is foundation only.
- **`ByteArray` still uses `number[]` internally** rather than
  `Uint8Array`. Converting it is straightforward but ripples through
  every caller; deferred.
- **No Web Component wrapping yet.** That comes in Phase 2 alongside
  the Lit introduction.

## How to work in this codebase

```bash
pnpm install            # one-time, get dependencies
pnpm dev                # dev server with hot reload at localhost:5173
pnpm test               # run the test suite
pnpm test:watch         # tests in watch mode
pnpm typecheck          # tsc --noEmit, surfaces all type errors
pnpm lint               # eslint
pnpm format             # prettier
pnpm build:all          # produce all four bundle flavors in dist/
```

The path aliases (`@common`, `@connections`, etc.) work in both source
files and tests. Use them — they survive refactoring better than
relative paths.

## Validating the migration

Phase 1's success criterion is "the output behaves identically." The
test suite covers the modules where regressions would be subtle
(`ByteArray`, `CRC`, `TypedEvent`, `StringUtils`). When subsequent
phases migrate `connections/`, `crt/`, etc., each gets its own test
suite added alongside.

End-to-end validation is harder because it requires a live BBS
connection. The recommended manual smoke test is:

1. Build a flavor: `pnpm build:norip:xfer`
2. Open `dist/index.html` (a copy of the original demo page works fine)
3. Connect to `bbs.ftelnet.ca:23` or any test BBS
4. Verify: text renders, colors are correct, the menu opens, scrollback
   works, file transfer dialogs render, the virtual keyboard appears on
   mobile.

If something looks wrong, diff the visible behavior against a build of
the unmodernized upstream. The migration goal is byte-for-byte the
same output on the wire and pixel-for-pixel the same render.
